import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { assertPlusPrice, billingConfig } from "./billing.server";

afterEach(() => vi.unstubAllEnvs());
const price = {
  active: true,
  livemode: false,
  currency: "eur",
  unit_amount: 399,
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
};
describe("test billing boundaries", () => {
  it("accepts only the EUR 3.99 monthly test plan", () => {
    expect(() => assertPlusPrice(price as Stripe.Price)).not.toThrow();
    for (const change of [
      { livemode: true },
      { active: false },
      { currency: "usd" },
      { unit_amount: 3990 },
      { recurring: { ...price.recurring, interval: "year" } },
      { recurring: { ...price.recurring, interval_count: 2 } },
      { recurring: { ...price.recurring, usage_type: "metered" } },
    ]) {
      expect(() => assertPlusPrice({ ...price, ...change } as Stripe.Price)).toThrow();
    }
  });
  it("refuses live or missing API keys", () => {
    for (const key of ["", "sk_live_example", "rk_live_example"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      expect(() => billingConfig()).toThrow("test mode");
    }
  });
  it("requires HTTPS outside localhost", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("APP_URL", "http://example.com");
    expect(() => billingConfig()).toThrow("APP_URL");
  });
});
