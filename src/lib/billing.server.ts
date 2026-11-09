import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export function billingConfig() {
  const key = process.env["STRIPE_SECRET_KEY"] ?? "";
  const origin = new URL(process.env["APP_URL"] ?? "http://localhost:3000");
  if (!key.startsWith("sk_test_")) throw new Error("Stripe test mode is not configured.");
  if (origin.protocol !== "https:" && origin.hostname !== "localhost")
    throw new Error("Invalid APP_URL");
  return {
    stripe: new Stripe(key),
    origin: origin.origin,
    priceId: process.env["STRIPE_PLUS_PRICE_ID"] ?? "",
  };
}

export function billingDb() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Billing database is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function assertPlusPrice(price: Stripe.Price) {
  if (
    price.livemode ||
    !price.active ||
    price.currency !== "eur" ||
    price.unit_amount !== 399 ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error("Expected an active test price of EUR 3.99 per month.");
  }
}

export async function checkout(userId: string) {
  const { stripe, origin, priceId } = billingConfig();
  assertPlusPrice(await stripe.prices.retrieve(priceId));
  const db = billingDb();
  const { data: row, error } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to read billing account.");
  let customer = row?.stripe_customer_id as string | undefined;
  if (!customer) {
    customer = (
      await stripe.customers.create(
        { metadata: { fridgie_user_id: userId } },
        { idempotencyKey: `fridgie-test-customer-${userId}` },
      )
    ).id;
    const { error: saveError } = await db
      .from("subscriptions")
      .upsert(
        { user_id: userId, stripe_customer_id: customer },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (saveError) throw new Error("Unable to save billing account.");
    const { error: linkError } = await db
      .from("subscriptions")
      .update({ stripe_customer_id: customer })
      .eq("user_id", userId)
      .is("stripe_customer_id", null);
    if (linkError) throw new Error("Unable to link billing account.");
  }
  const existing = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  if (existing.data.some((s) => !["canceled", "incomplete_expired"].includes(s.status))) {
    return portal(userId);
  }
  const pending = await stripe.checkout.sessions.list({ customer, status: "open", limit: 10 });
  const reusable = pending.data.find((s) => s.mode === "subscription" && !s.livemode && s.url);
  if (reusable?.url) return { url: reusable.url };
  const session = await stripe.checkout.sessions.create(
    {
      customer,
      mode: "subscription",
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { fridgie_user_id: userId } },
      success_url: `${origin}/plus?checkout=success`,
      cancel_url: `${origin}/plus?checkout=canceled`,
    },
    { idempotencyKey: `fridgie-test-checkout-${userId}-${Math.floor(Date.now() / 1_800_000)}` },
  );
  if (session.livemode || !session.url) throw new Error("Test checkout unavailable.");
  return { url: session.url };
}

export async function portal(userId: string) {
  const { stripe, origin } = billingConfig();
  const { data, error } = await billingDb()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();
  if (error || !data?.stripe_customer_id) throw new Error("Billing account not found.");
  const customer = await stripe.customers.retrieve(data.stripe_customer_id);
  if (customer.deleted || customer.livemode) throw new Error("Test customer required.");
  return stripe.billingPortal.sessions
    .create({ customer: customer.id, return_url: `${origin}/plus` })
    .then((s) => ({ url: s.url }));
}

export async function stripeWebhook(request: Request) {
  const { stripe, priceId } = billingConfig();
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode) return new Response("Live events forbidden", { status: 400 });
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    return new Response("Ignored");
  // Fetch current state: Stripe may deliver events out of order, including in the same second.
  const subscription = await stripe.subscriptions.retrieve(
    (event.data.object as Stripe.Subscription).id,
  );
  if (subscription.livemode) return new Response("Live subscriptions forbidden", { status: 400 });
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  if (subscription.items.data.length !== 1 || item?.price.id !== priceId || item.quantity !== 1)
    return new Response("Ignored unrelated plan");
  assertPlusPrice({ ...item.price, active: true }); // Archived prices still belong to existing subscriptions.
  const db = billingDb();
  const { data: owner, error } = await db
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (error || !owner) return new Response("Unknown customer", { status: 500 });
  const { error: updateError } = await db.rpc("apply_stripe_test_subscription", {
    p_user_id: owner.user_id,
    p_subscription_id: subscription.id,
    p_status: subscription.status,
    p_period_end: new Date(item.current_period_end * 1000).toISOString(),
    p_event_created: event.created,
  });
  return new Response(updateError ? "Update failed" : "OK", { status: updateError ? 500 : 200 });
}
