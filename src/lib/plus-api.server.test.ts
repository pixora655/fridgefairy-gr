// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
const m = vi.hoisted(() => ({
  queue: [] as any[],
  calls: [] as any[],
  rpc: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: m.getUser },
    rpc: m.rpc,
    from: (table: string) => {
      const chain: any = {};
      for (const method of [
        "select",
        "eq",
        "gt",
        "lte",
        "order",
        "limit",
        "maybeSingle",
        "single",
        "in",
        "insert",
        "update",
      ])
        chain[method] = (...args: any[]) => {
          m.calls.push({ table, method, args });
          return chain;
        };
      chain.then = (resolve: any) =>
        Promise.resolve(m.queue.shift() ?? { data: null, error: null }).then(resolve);
      return chain;
    },
  }),
}));
vi.mock("./ai.server", async (importOriginal) => ({ ...(await importOriginal<typeof import("./ai.server")>()), streamResponseText: vi.fn(), extractJson: JSON.parse }));
import { plusApi } from "./plus-api.server";
const env = {
  FRIDGIE_PLUS_ENABLED: "true",
  PLUS_SUPABASE_URL: "https://example.invalid",
  PLUS_SUPABASE_PUBLISHABLE_KEY: "synthetic-public",
  PLUS_SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
  PADDLE_SANDBOX_ENABLED: "true",
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_API_KEY: "pdl_sdbx_synthetic",
  PADDLE_PRICE_ID: "pri_test",
  PADDLE_WEBHOOK_SECRET: "test-only-secret",
};
function hook(type = "transaction.completed", id = "txn_test", changed = false) {
  const ts = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({
    event_id: "evt_test",
    event_type: type,
    occurred_at: new Date().toISOString(),
    data: { id },
  });
  const h = createHmac("sha256", env.PADDLE_WEBHOOK_SECRET)
    .update(ts + ":" + raw)
    .digest("hex");
  return new Request("https://test.invalid/.netlify/functions/plus?action=webhook", {
    method: "POST",
    headers: { "paddle-signature": `ts=${ts};h1=${h}` },
    body: changed ? raw + " " : raw,
  });
}
function browser(action: string, body?: unknown) {
  return new Request("https://test.invalid/.netlify/functions/plus?action=" + action, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer synthetic-user-token", origin: "https://test.invalid" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, v));
  m.queue.length = 0;
  m.calls.length = 0;
  m.rpc.mockReset();
  m.getUser.mockReset();
  m.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Plus endpoint security", () => {
  it("rejects unsigned or changed webhooks before database access", async () => {
    expect((await plusApi(hook(undefined, undefined, true))).status).toBe(401);
    expect(m.calls).toHaveLength(0);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("deduplicates a verified repeated event before provider calls", async () => {
    m.queue.push({ data: { event_id: "evt_test" }, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await (await plusApi(hook())).json()).toEqual({ duplicate: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("failed renewal and lifecycle events never grant quota", async () => {
    expect(await (await plusApi(hook("transaction.payment_failed"))).json()).toEqual({
      ignored: true,
    });
    expect(await (await plusApi(hook("subscription.canceled", "sub_test"))).json()).toEqual({
      ignored: true,
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects completed transaction with wrong total", async () => {
    m.queue.push({ data: null, error: null });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              data: {
                status: "completed",
                currency_code: "EUR",
                subscription_id: "sub_test",
                billing_period: {},
                items: [{ price: { id: "pri_test" }, quantity: 1 }],
                details: { totals: { total: "398" } },
              },
            }),
          ),
        ),
    );
    expect((await plusApi(hook())).status).toBe(422);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("verified transaction with known owner calls atomic reconciliation RPC", async () => {
    m.queue.push({ data: null, error: null }, { data: { user_id: "user-a" }, error: null });
    const t = {
      id: "txn_test",
      status: "completed",
      customer_id: "ctm_test",
      currency_code: "EUR",
      subscription_id: "sub_test",
      billing_period: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
      items: [{ price: { id: "pri_test" }, quantity: 1 }],
      details: { totals: { total: "399" } },
    };
    const s = {
      id: "sub_test",
      customer_id: "ctm_test",
      status: "active",
      items: [{ price: { id: "pri_test" } }],
      scheduled_change: null,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: t })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: s }))),
    );
    m.rpc.mockResolvedValue({ data: true, error: null });
    expect((await plusApi(hook())).status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith(
      "plus_apply_payment",
      expect.objectContaining({
        p_user: "user-a",
        p_transaction: "txn_test",
        p_start: t.billing_period.starts_at,
        p_end: t.billing_period.ends_at,
      }),
    );
  });
  it("unmapped subscription cannot grant itself a user via custom_data", async () => {
    m.queue.push(
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    const t = {
      id: "txn_test",
      status: "completed",
      customer_id: "ctm_test",
      currency_code: "EUR",
      subscription_id: "sub_test",
      billing_period: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
      items: [{ price: { id: "pri_test" }, quantity: 1 }],
      details: { totals: { total: "399" } },
      custom_data: {
        fridgie_checkout_id: "00000000-0000-4000-8000-000000000000",
        user_id: "attacker",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: t })))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                id: "sub_test",
                customer_id: "ctm_test",
                items: [{ price: { id: "pri_test" } }],
              },
            }),
          ),
        ),
    );
    expect((await plusApi(hook())).status).toBe(422);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid session before reading private records", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: {} });
    expect((await plusApi(browser("account"))).status).toBe(401);
    expect(m.calls).toHaveLength(0);
  });
  it("rejects cross-origin writes", async () => {
    const r = new Request("https://test.invalid/.netlify/functions/plus?action=checkout", {
      method: "POST",
      headers: { origin: "https://evil.invalid" },
    });
    expect((await plusApi(r)).status).toBe(403);
    expect(m.getUser).not.toHaveBeenCalled();
  });
  it("filters account reads by verified user, never client body user ID", async () => {
    m.rpc.mockResolvedValueOnce({data:{version:"unlimited-v1",recipeLimit:null,photoLimit:null},error:null});
    m.queue.push({ data: null, error: null }, { data: null, error: null });
    expect((await plusApi(browser("account"))).status).toBe(200);
    expect(
      m.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === "user-a"),
    ).toBe(true);
  });
  it("plan and shopping edits save atomically for verified owner", async () => {
    m.queue.push(
      { data: { user_id: "user-a" }, error: null },
      { data: { id: "cycle-a" }, error: null },
      { data: [{ id: "00000000-0000-4000-8000-000000000001" }], error: null },
    );
    m.rpc.mockResolvedValue({ data: null, error: null });
    const r = new Request(
      "https://test.invalid/.netlify/functions/plus?action=plan&week=2026-10-05",
      {
        method: "POST",
        headers: { authorization: "Bearer synthetic", origin: "https://test.invalid" },
        body: JSON.stringify({
          slots: ["00000000-0000-4000-8000-000000000001", null, null, null, null, null, null],
          items: [{ name: "Tomato", checked: true }],
        }),
      },
    );
    expect((await plusApi(r)).status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith(
      "plus_save_plan",
      expect.objectContaining({ p_user: "user-a", p_items: [{ name: "Tomato", checked: true }] }),
    );
  });
  it("foreign recipe in plan is rejected", async () => {
    m.queue.push(
      { data: { user_id: "user-a" }, error: null },
      { data: { id: "cycle-a" }, error: null },
      { data: [], error: null },
    );
    const r = new Request(
      "https://test.invalid/.netlify/functions/plus?action=plan&week=2026-10-05",
      {
        method: "POST",
        headers: { authorization: "Bearer synthetic", origin: "https://test.invalid" },
        body: JSON.stringify({
          slots: ["00000000-0000-4000-8000-000000000001", null, null, null, null, null, null],
          items: [],
        }),
      },
    );
    expect((await plusApi(r)).status).toBe(403);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("disabled configuration returns honest status and blocks writes", async () => {
    vi.stubEnv("FRIDGIE_PLUS_ENABLED", "false");
    expect(await (await plusApi(browser("status"))).json()).toMatchObject({
      ready: false,
      billing: false,
    });
    expect((await plusApi(browser("checkout", {}))).status).toBe(503);
  });
});

describe("Unlimited preview endpoint (mocked, no network)",()=>{
 const id="00000000-0000-4000-8000-000000000001";
 const payloads=[{id,kind:"recipe",ingredients:["eggs"],filters:[]},{id,kind:"photo",image:"data:image/png;base64,YQ=="}];
 it.each(payloads)("uses unlimited RPC and replays stored $kind without AI", async payload=>{
  const saved={ok:true,marker:"already-accounted"};
  m.rpc.mockResolvedValueOnce({data:{state:"success",result:saved},error:null});
  const response=await plusApi(browser("ai",payload));expect(response.status).toBe(200);expect(await response.json()).toEqual(saved);
  expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc.mock.calls[0]?.[0]).toBe("plus_reserve_unlimited");
 });
 it.each(["attempt_limit","concurrency_limit"])("returns 429 for %s",async code=>{
  m.rpc.mockResolvedValueOnce({data:null,error:{message:code}});
  expect((await plusApi(browser("ai",payloads[0]))).status).toBe(429);
 });
 it("fails closed when new RPC migration is absent",async()=>{
  m.rpc.mockResolvedValueOnce({data:null,error:{message:"function not found"}});
  expect((await plusApi(browser("ai",payloads[0]))).status).toBe(503);expect(m.rpc).toHaveBeenCalledTimes(1);
 });
});
