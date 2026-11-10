import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeWebhook } from "./stripe.server";

const secret = "whsec_fixture";
const stripe = new Stripe("sk_test_fixture");

function setup(context = "deploy-preview") {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("FRIDGIE_BILLING_ORIGIN", "https://preview.example");
  vi.stubEnv("STRIPE_BILLING_MODE", "test");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture");
  vi.stubEnv("CONTEXT", context);
}

function webhook(livemode: boolean, tampered = false) {
  const payload = JSON.stringify({ type: "customer.created", livemode });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://preview.example/api/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: tampered ? payload + " " : payload,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("Stripe webhook trust boundary", () => {
  it("accepts a signed event for the configured mode", async () => {
    setup();
    expect((await stripeWebhook(webhook(false))).status).toBe(204);
  });

  it("rejects an event whose body changed after signing", async () => {
    setup();
    expect((await stripeWebhook(webhook(false, true))).status).toBe(400);
  });

  it("rejects an event from the opposite mode even with a valid signature", async () => {
    setup();
    expect((await stripeWebhook(webhook(true))).status).toBe(400);
  });

  it("rejects live billing configuration", async () => {
    setup();
    vi.stubEnv("STRIPE_BILLING_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture");
    expect((await stripeWebhook(webhook(true))).status).toBe(503);
  });

  it("disables sandbox billing in Netlify production", async () => {
    setup("production");
    expect((await stripeWebhook(webhook(false))).status).toBe(503);
  });
});
