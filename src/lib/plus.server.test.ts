import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { getVerifiedRecipePrefs } from "./plus.server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle };
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: vi.fn(() => query) });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
});

describe("Server premium recipe preferences", () => {
  const prefs = { dietary: ["Vegan"], servings: 6 };
  it("ignores signed-out premium settings without requiring sign-in for free recipes", async () => {
    expect(await getVerifiedRecipePrefs(undefined, prefs)).toEqual({});
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("ignores settings when bearer verification fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", prefs)).toEqual({});
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
  it("ignores settings for a verified free user", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", prefs)).toEqual({});
  });
  it("ignores settings for an expired active subscription", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { status: "active", current_period_end: "2026-11-06T00:00:00Z" }, error: null });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-07T00:00:00Z"));
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", prefs)).toEqual({});
    vi.restoreAllMocks();
  });
  it("applies dietary needs and six servings only for verified unexpired Plus", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { status: "active", current_period_end: "2099-01-01T00:00:00Z" }, error: null });
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", prefs)).toEqual({ dietary: ["Vegan"], servings: 6 });
  });
  it("preserves a Plus request for one serving", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { status: "trialing", current_period_end: "2099-01-01T00:00:00Z" }, error: null });
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", { servings: 1 })).toEqual({ servings: 1 });
  });
  it("fails closed when the entitlement read fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await getVerifiedRecipePrefs("Bearer test.token.value", prefs)).toEqual({});
  });
});