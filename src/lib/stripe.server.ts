import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function billingConfig(report: (reason: string) => void = console.warn) {
  const {
    STRIPE_SECRET_KEY: key,
    STRIPE_PLUS_PRICE_ID: price,
    STRIPE_WEBHOOK_SECRET: webhook,
    FRIDGIE_BILLING_ORIGIN: origin,
    STRIPE_BILLING_MODE: mode,
  } = process.env;
  if (process.env["CONTEXT"] === "production") {
    report("[Stripe] Billing disabled in production.");
    return null;
  }
  const missing = Object.entries({
    STRIPE_SECRET_KEY: key,
    STRIPE_PLUS_PRICE_ID: price,
    STRIPE_WEBHOOK_SECRET: webhook,
    FRIDGIE_BILLING_ORIGIN: origin,
    SUPABASE_URL: process.env["SUPABASE_URL"],
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"],
  }).filter(([, value]) => !value).map(([name]) => name);
  if (!key || !price || !webhook || !origin || missing.length > 0) {
    report(`[Stripe] Missing billing configuration: ${missing.join(", ")}`);
    return null;
  }
  if (mode !== "test" || !/^(sk|rk)_test_/.test(key)) {
    report("[Stripe] Billing requires test mode and a test secret key.");
    return null;
  }
  try {
    if (new URL(origin).origin !== origin || !origin.startsWith("https://")) {
      report("[Stripe] Billing origin must be an exact HTTPS origin.");
      return null;
    }
  } catch {
    report("[Stripe] Billing origin is not a valid URL.");
    return null;
  }
  return { key, price, webhook, origin, live: false };
}

type Config = NonNullable<ReturnType<typeof billingConfig>>;

function isPlusPrice(price: Stripe.Price, config: Config) {
  return price.active && price.livemode === config.live && price.currency === "eur" &&
    price.unit_amount === 399 && price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1;
}

export async function checkSandboxDependencies(config: Config) {
  const stripe = new Stripe(config.key, { maxNetworkRetries: 0, timeout: 5000 });
  try {
    if (!isPlusPrice(await stripe.prices.retrieve(config.price), config)) {
      return "[Stripe] Price must be an active sandbox subscription for EUR 3.99 per month.";
    }
  } catch {
    return "[Stripe] Could not retrieve the configured price with the sandbox key.";
  }

  try {
    const { error } = await supabaseAdmin.from("subscriptions").select("user_id").limit(1);
    if (error) return "[Stripe] Cannot read subscriptions with the configured Supabase server credentials.";
  } catch {
    return "[Stripe] Cannot connect to Supabase with the configured server credentials.";
  }

  return null;
}

async function getCustomer(stripe: Stripe, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await stripe.customers.create(
    {},
    { idempotencyKey: `fridgie-customer-${userId}` },
  );
  const { error: insertError } = await supabaseAdmin
    .from("subscriptions")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { error: updateError } = await supabaseAdmin
    .from("subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", userId)
    .is("stripe_customer_id", null);
  if (updateError) throw updateError;
  const { data: row, error: readError } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();
  if (readError || !row?.stripe_customer_id) throw new Error("Unable to link billing customer");
  return row.stripe_customer_id;
}

function portal(stripe: Stripe, customer: string, config: Config) {
  return stripe.billingPortal.sessions.create({ customer, return_url: `${config.origin}/plus` });
}

export async function startBilling(userId: string, manage: boolean) {
  const config = billingConfig();
  if (!config) throw new Error("Billing is unavailable");
  const stripe = new Stripe(config.key, { maxNetworkRetries: 2, timeout: 10_000 });
  if (manage) {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();
    if (error || !data.stripe_customer_id) throw new Error("Billing customer not found");
    return { url: (await portal(stripe, data.stripe_customer_id, config)).url };
  }

  const price = await stripe.prices.retrieve(config.price);
  if (!isPlusPrice(price, config)) throw new Error("Invalid Plus price");

  const customer = await getCustomer(stripe, userId);
  const subscriptions = await stripe.subscriptions.list({ customer });
  if (
    subscriptions.data.some(
      (sub) => sub.status !== "incomplete_expired" && sub.status !== "canceled",
    )
  ) {
    return { url: (await portal(stripe, customer, config)).url };
  }

  const sessions = await stripe.checkout.sessions.list({ customer, limit: 1 });
  const latest = sessions.data[0];
  if (latest?.status === "open" && latest.url) return { url: latest.url };
  const session = await stripe.checkout.sessions.create(
    {
      customer,
      mode: "subscription",
      allowed_payment_method_types: ["card"],
      line_items: [{ price: config.price, quantity: 1 }],
      success_url: `${config.origin}/plus?checkout=success`,
      cancel_url: `${config.origin}/plus`,
    },
    { idempotencyKey: `fridgie-checkout-${customer}-${latest?.id ?? "first"}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

async function syncSubscription(stripe: Stripe, customer: string, config: Config) {
  // Re-read Stripe rather than applying the webhook snapshot, since deliveries may be out of order.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, updated_at")
      .eq("stripe_customer_id", customer)
      .maybeSingle();
    if (error) throw error;
    if (!row) return;

    let selected: { subscription: Stripe.Subscription; end: number } | undefined;
    for await (const subscription of stripe.subscriptions.list({ customer, status: "all" })) {
      const item = subscription.items.data.find((entry) => entry.price.id === config.price);
      if (!item || subscription.livemode !== config.live) continue;
      if (subscription.status !== "active" && subscription.status !== "trialing") continue;
      const end =
        subscription.status === "trialing" ? subscription.trial_end : item.current_period_end;
      if (end && (!selected || end > selected.end)) selected = { subscription, end };
    }

    const { data: changed, error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: selected?.subscription.status ?? "inactive",
        stripe_subscription_id: selected?.subscription.id ?? null,
        current_period_end: selected ? new Date(selected.end * 1000).toISOString() : null,
        updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString(),
      })
      .eq("user_id", row.user_id)
      .eq("updated_at", row.updated_at)
      .select("user_id");
    if (updateError) throw updateError;
    if (changed.length) return;
  }
  throw new Error("Concurrent billing update");
}

export async function stripeWebhook(request: Request) {
  const config = billingConfig();
  if (!config) return new Response("Billing unavailable", { status: 503 });
  const stripe = new Stripe(config.key, { maxNetworkRetries: 2, timeout: 10_000 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, config.webhook);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode !== config.live) return new Response("Wrong Stripe mode", { status: 400 });

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const customer = event.data.object.customer;
      const id = typeof customer === "string" ? customer : customer?.id;
      if (!id) break;
      try {
        await syncSubscription(stripe, id, config);
      } catch {
        return new Response("Could not sync subscription", { status: 503 });
      }
      break;
    }
  }
  return new Response(null, { status: 204 });
}
