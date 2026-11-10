import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  retrieve: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEventAsync: mocks.verify };
    subscriptions = { retrieve: mocks.retrieve };
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    rpc: mocks.rpc,
  }),
}));
import { stripeWebhook } from "./billing.server";
const request = () =>
  new Request("https://example.com/api/stripe-webhook", {
    method: "POST",
    body: "raw signed body",
    headers: { "stripe-signature": "signature" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_plus");
  mocks.verify.mockResolvedValue({
    type: "customer.subscription.updated",
    livemode: false,
    created: 123,
    data: { object: { id: "sub_test", status: "active" } },
  });
  mocks.retrieve.mockResolvedValue({
    id: "sub_test",
    customer: "cus_test",
    status: "canceled",
    livemode: false,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1800000000,
          price: {
            id: "price_plus",
            active: true,
            livemode: false,
            currency: "eur",
            unit_amount: 399,
            recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
          },
        },
      ],
    },
  });
  mocks.single.mockResolvedValue({ data: { user_id: "verified-owner" }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
it("rejects invalid signatures without updating entitlements", async () => {
  mocks.verify.mockRejectedValue(new Error("signature"));
  expect((await stripeWebhook(request())).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects live events", async () => {
  mocks.verify.mockResolvedValue({ livemode: true });
  expect((await stripeWebhook(request())).status).toBe(400);
  expect(mocks.retrieve).not.toHaveBeenCalled();
});
it("uses current Stripe state and database owner, never stale event status", async () => {
  expect((await stripeWebhook(request())).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "apply_stripe_test_subscription",
    expect.objectContaining({ p_user_id: "verified-owner", p_status: "canceled" }),
  );
  expect(mocks.verify).toHaveBeenCalledWith("raw signed body", "signature", "whsec_example");
});
it("returns a retryable failure when persistence fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  expect((await stripeWebhook(request())).status).toBe(500);
});
