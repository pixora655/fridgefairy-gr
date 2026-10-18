import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  config,
  PlusError,
  verifyWebhook,
  aiInput,
  fingerprint,
  recipeSchema,
  weekSchema,
  shoppingSchema,
  shoppingFromRecipes,
  runReservedAI,
} from "./plus-core.server";
import { GatewayError, streamResponseText, extractJson } from "./ai.server";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function db() {
  return createClient(
    process.env["PLUS_SUPABASE_URL"]!,
    process.env["PLUS_SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const known = [
      "subscription_required",
      "quota_exhausted",
      "attempt_limit",
      "concurrency_limit",
      "idempotency_conflict",
    ];
    const code = known.find((c) => error.message.includes(c));
    const messages: Record<string, string> = {
      subscription_required: "A paid Plus subscription is required.",
      quota_exhausted: "Your allowance for this paid billing cycle is exhausted.",
      concurrency_limit: "Too many operations in progress. Please wait and try again.",
      attempt_limit: "Too many attempts. Please try again later.",
      idempotency_conflict: "This request ID was used with different content.",
    };
    throw new PlusError(
      code === "idempotency_conflict" ? 409 : (code === "attempt_limit" || code === "concurrency_limit") ? 429 : code ? 403 : 503,
      code ? messages[code]! : "The service is unavailable.",
    );
  }
  return data;
}
async function checked<T>(r: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await r;
  if (error) throw new PlusError(503, "Storage is unavailable.");
  return data;
}
async function paddle(path: string, method = "GET", body?: unknown) {
  if (!config().billing)
    throw new PlusError(503, "Sandbox payments are not configured.");
  const r = await fetch("https://sandbox-api.paddle.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env["PADDLE_API_KEY"],
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new PlusError(502, "The sandbox payment service did not respond.");
  return (await r.json()).data;
}
async function user(req: Request) {
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new PlusError(401, "Please sign in first.");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new PlusError(401, "Your sign-in session has expired.");
  return data.user.id;
}
async function active(uid: string) {
  const now = new Date().toISOString();
  const s = await checked(
    db()
      .from("plus_subscriptions")
      .select("*")
      .eq("user_id", uid)
      .gt("paid_until", now)
      .maybeSingle(),
  );
  if (!s) throw new PlusError(403, "A paid Plus billing cycle is required.");
  const c = await checked(
    db()
      .from("plus_cycles")
      .select("*")
      .eq("user_id", uid)
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!c) throw new PlusError(403, "No paid billing cycle is available.");
  return { subscription: s, cycle: c };
}
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 8_100_000) throw new PlusError(413, "The request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new PlusError(400, "Invalid request.");
  }
}
async function webhook(req: Request) {
  if (!config().billing) throw new PlusError(503, "Sandbox disabled");
  const raw = await req.text();
  if (raw.length > 1_000_000) throw new PlusError(413, "Payload too large");
  verifyWebhook(
    raw,
    req.headers.get("paddle-signature") ?? "",
    process.env["PADDLE_WEBHOOK_SECRET"]!,
  );
  const e = z
    .object({
      event_id: z.string().min(1),
      event_type: z.string(),
      occurred_at: z.string().datetime(),
      data: z.object({ id: z.string().min(1) }).passthrough(),
    })
    .parse(JSON.parse(raw));
  // Subscription lifecycle events deliberately do not grant quota; portal/reconciliation reads provider state.
  if (e.event_type !== "transaction.completed") return json({ ignored: true });
  const known = await checked(
    db().from("plus_events").select("event_id").eq("event_id", e.event_id).maybeSingle(),
  );
  if (known) return json({ duplicate: true });
  // Re-fetch trusted provider record rather than granting from webhook fields.
  z.string().regex(/^txn_/).parse(e.data.id);
  const t = await paddle("/transactions/" + encodeURIComponent(e.data.id));
  if (
    t.status !== "completed" ||
    t.currency_code !== "EUR" ||
    !t.subscription_id ||
    !t.billing_period ||
    t.items?.length !== 1 ||
    t.items[0].price?.id !== process.env["PADDLE_PRICE_ID"] ||
    t.items[0].quantity !== 1 ||
    t.details?.totals?.total !== "399"
  )
    throw new PlusError(422, "Unverified paid transaction");
  const s = await paddle("/subscriptions/" + encodeURIComponent(t.subscription_id));
  if (
    s.customer_id !== t.customer_id ||
    s.items?.length !== 1 ||
    s.items[0].price?.id !== process.env["PADDLE_PRICE_ID"]
  )
    throw new PlusError(422, "Subscription mismatch");
  let owner = await checked(
    db()
      .from("plus_subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", s.id)
      .maybeSingle(),
  );
  if (!owner) {
    const checkoutId = t.custom_data?.fridgie_checkout_id;
    z.string().uuid().parse(checkoutId);
    const m = await checked(
      db()
        .from("plus_checkouts")
        .select("user_id,transaction_id")
        .eq("id", checkoutId)
        .maybeSingle(),
    );
    if (!m || m.transaction_id !== t.id) throw new PlusError(422, "Checkout ownership mismatch");
    owner = m;
  }
  const applied = await rpc("plus_apply_payment", {
    p_event: e.event_id,
    p_at: e.occurred_at,
    p_type: e.event_type,
    p_user: owner.user_id,
    p_transaction: t.id,
    p_subscription: s.id,
    p_customer: s.customer_id,
    p_start: t.billing_period.starts_at,
    p_end: t.billing_period.ends_at,
    p_status: s.status,
    p_cancel: s.scheduled_change?.action === "cancel" ? s.scheduled_change.effective_at : null,
  });
  return json({ processed: applied });
}
export async function plusApi(req: Request) {
  try {
    const action = new URL(req.url).searchParams.get("action") ?? "status";
    if (action === "status" && req.method === "GET")
      return json({ ...config(), price: "€3.99 / month", taxInclusive: true, sandbox: true });
    if (!config().ready)
      throw new PlusError(503, "Plus is not enabled in this environment.");
    if (req.method === "POST" && action === "webhook") return await webhook(req);
    // Require same origin for all browser writes. Provider webhooks use signature instead.
    if (req.method === "POST") {
      const origin = req.headers.get("origin");
      if (!origin || origin !== new URL(req.url).origin) throw new PlusError(403, "Invalid origin");
    }
    const uid = await user(req);
    if (req.method === "GET" && action === "account") {
      const subscription = await checked(
        db().from("plus_subscriptions").select("*").eq("user_id", uid).maybeSingle(),
      );
      let entitlement = null;
      try {
        entitlement = await active(uid);
      } catch (e) {
        if (!(e instanceof PlusError && e.status === 403)) throw e;
      }
      let display = subscription;
      if (subscription && config().billing) {
        const current = await paddle(
          "/subscriptions/" + encodeURIComponent(subscription.provider_subscription_id),
        );
        if (current.customer_id !== subscription.provider_customer_id)
          throw new PlusError(409, "Subscription mismatch");
        display = {
          ...subscription,
          status: current.status,
          cancel_at:
            current.scheduled_change?.action === "cancel"
              ? current.scheduled_change.effective_at
              : null,
        };
      }
      return json({
        subscription: display,
        cycle: entitlement?.cycle ?? null,
        billingReady: config().billing,
        usagePolicy: await rpc("plus_usage_policy", {}),
      });
    }
    if (req.method === "POST" && action === "checkout") {
      if (!config().billing)
        throw new PlusError(503, "Sandbox payments are unavailable.");
      const existing = await checked(
        db().from("plus_subscriptions").select("user_id").eq("user_id", uid).maybeSingle(),
      );
      if (existing)
        throw new PlusError(409, "A subscription already exists. Use subscription management.");
      const recent = await checked(
        db()
          .from("plus_checkouts")
          .select("id")
          .eq("user_id", uid)
          .gt("created_at", new Date(Date.now() - 3600000).toISOString()),
      );
      if ((recent?.length ?? 0) >= 5) throw new PlusError(429, "Please try again later.");
      // Server configured price only; no client amounts, user IDs or price IDs accepted.
      const price = await paddle("/prices/" + encodeURIComponent(process.env["PADDLE_PRICE_ID"]!));
      if (
        price.status !== "active" ||
        price.unit_price?.amount !== "399" ||
        price.unit_price?.currency_code !== "EUR" ||
        price.billing_cycle?.interval !== "month" ||
        price.billing_cycle?.frequency !== 1 ||
        price.tax_mode !== "internal" ||
        price.trial_period !== null
      )
        throw new PlusError(503, "The sandbox price must be EUR 3.99 including tax.");
      const checkout = await checked(
        db().from("plus_checkouts").insert({ user_id: uid }).select("id").single(),
      );
      if (!checkout) throw new PlusError(503, "Checkout unavailable");
      const t = await paddle("/transactions", "POST", {
        items: [{ price_id: process.env["PADDLE_PRICE_ID"], quantity: 1 }],
        custom_data: { fridgie_checkout_id: checkout.id },
      });
      await checked(
        db()
          .from("plus_checkouts")
          .update({ transaction_id: t.id })
          .eq("id", checkout.id)
          .eq("user_id", uid),
      );
      if (!/^txn_[a-z0-9]+$/.test(t.id)) throw new PlusError(502, "Invalid transaction");
      return json({ transactionId: t.id, sandbox: true });
    }
    if (req.method === "POST" && action === "portal") {
      const s = await checked(
        db().from("plus_subscriptions").select("*").eq("user_id", uid).single(),
      );
      const current = await paddle(
        "/subscriptions/" + encodeURIComponent(s.provider_subscription_id),
      );
      if (current.customer_id !== s.provider_customer_id)
        throw new PlusError(409, "Subscription mismatch");
      // Cancellation or failed renewals do not create cycles. Existing paid end remains authoritative.
      const p = await paddle(
        "/customers/" + encodeURIComponent(s.provider_customer_id) + "/portal-sessions",
        "POST",
        { subscription_ids: [s.provider_subscription_id] },
      );
      const url = new URL(p.urls?.general?.overview);
      if (url.protocol !== "https:" || !url.hostname.endsWith(".paddle.com"))
        throw new PlusError(502, "Invalid portal URL");
      return json({ url: url.href });
    }
    if (req.method === "POST" && action === "ai") {
      const data = aiInput.parse(await body(req));
      const { id, ...payload } = data;
      const result = await runReservedAI(
        {
          reserve: () =>
            rpc("plus_reserve_unlimited", {
              p_user: uid,
              p_id: id,
              p_kind: data.kind,
              p_fingerprint: fingerprint(payload),
            }),
          finish: (success, result) =>
            rpc("plus_finish", { p_user: uid, p_id: id, p_success: success, p_result: result }),
        },
        async () => {
          if (data.kind === "photo") {
            const text = await streamResponseText([
              {
                type: "input_text",
                text: 'List visible food ingredients, not objects. Return JSON {"ingredients":string[]} with short names. No food means empty array.',
              },
              { type: "input_image", image_url: data.image },
            ]);
            return {
              ok: true,
              ...z
                .object({ ingredients: z.array(z.string().min(1).max(80)).max(30) })
                .parse(extractJson(text)),
            };
          }
          const text = await streamResponseText([
            {
              type: "input_text",
              text: `Friendly chef. Ingredients: ${JSON.stringify(data.ingredients)}. Filters: ${JSON.stringify(data.filters)}. Return JSON {"recipes":[3 recipes]}. Each recipe has title, description, minutes (1-300), difficulty Easy|Medium|Hard, category pasta|bowl|stirfry|eggs, uses string[], missing string[] (max 2), steps string[] (4-7), tags string[]. First two recipes must have no missing ingredients. Basic salt, pepper, oil, water allowed.`,
            },
          ]);
          const parsed = z
            .object({ recipes: z.array(recipeSchema).length(3) })
            .parse(extractJson(text));
          if (parsed.recipes.slice(0, 2).some((r) => r.missing.length))
            throw new GatewayError(502, "Invalid ingredients", { stage: "validation", code: "invalid_ingredients" });
          return { ok: true, ...parsed };
        },
        { requestId: id, kind: data.kind },
      );
      return json(result);
    }
    await active(uid);
    if (req.method === "GET" && action === "recipes")
      return json(
        await checked(
          db()
            .from("plus_recipes")
            .select("id,recipe,created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(200),
        ),
      );
    if (action === "plan") {
      const week = weekSchema.parse(new URL(req.url).searchParams.get("week"));
      if (req.method === "GET") {
        const plan = await checked(
          db()
            .from("plus_meal_plans")
            .select("slots")
            .eq("user_id", uid)
            .eq("week", week)
            .maybeSingle(),
        );
        const shopping = await checked(
          db()
            .from("plus_shopping_lists")
            .select("items")
            .eq("user_id", uid)
            .eq("week", week)
            .maybeSingle(),
        );
        return json({ slots: plan?.slots ?? Array(7).fill(null), items: shopping?.items ?? [] });
      }
      if (req.method === "POST") {
        const b = z
          .object({ slots: z.array(z.string().uuid().nullable()).length(7), items: shoppingSchema })
          .parse(await body(req));
        const ids = b.slots.filter((s): s is string => !!s);
        if (ids.length) {
          const owned = await checked(
            db().from("plus_recipes").select("id").eq("user_id", uid).in("id", ids),
          );
          if (new Set(ids).size !== (owned?.length ?? 0))
            throw new PlusError(403, "Recipe unavailable.");
        }
        // Single DB transaction via RPC keeps plan and shopping edits consistent.
        await rpc("plus_save_plan", {
          p_user: uid,
          p_week: week,
          p_slots: b.slots,
          p_items: b.items,
        });
        return json({ saved: true });
      }
    }
    if (req.method === "POST" && action === "shopping") {
      const b = z.object({ ids: z.array(z.string().uuid()).max(7) }).parse(await body(req));
      const rows = b.ids.length
        ? await checked(
            db().from("plus_recipes").select("id,recipe").eq("user_id", uid).in("id", b.ids),
          )
        : [];
      if ((rows?.length ?? 0) !== new Set(b.ids).size)
        throw new PlusError(403, "Recipe unavailable.");
      return json(shoppingFromRecipes((rows ?? []).map((r) => r.recipe)));
    }
    throw new PlusError(404, "Not found");
  } catch (e) {
    if (e instanceof PlusError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return json({ error: "Invalid data." }, 400);
    return json({ error: "The service is unavailable. Please try again later." }, 503);
  }
}
