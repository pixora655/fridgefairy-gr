// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { streamResponseText, extractJson } from "./ai.server";
import { runReservedAI, recipeSchema } from "./plus-core.server";
import { logAIError } from "./plus-ai-diagnostics.server";
const context = { requestId: "11111111-1111-4111-8111-111111111111", kind: "recipe" };
const sensitive = "synthetic-secret-token-user@example.invalid";
let fetchMock: ReturnType<typeof vi.fn>, logs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // Every provider fetch is intercepted, including unexpected calls: never real network.
  fetchMock = vi.fn().mockRejectedValue(new Error("Unexpected offline fetch " + sensitive));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GEMINI_API_KEY", sensitive);
  vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
  logs = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function ledger() {
  let state = "new", result: unknown;
  const counters = { used: 0, pending: 0, saved: 0 };
  const store = {
    reserve: async () => { if (state !== "new") return { state, result }; state = "pending"; counters.pending++; return { state: "reserved" }; },
    finish: async (success: boolean, value: unknown) => { if (state === "pending") { counters.pending--; if (success) { counters.used++; counters.saved = 3; } state = success ? "success" : "failed"; result = value; } return result; },
  };
  return { store, counters, state: () => state };
}
async function providerWork() { return extractJson(await streamResponseText([{ type: "input_text", text: sensitive }])); }
async function fail(work = providerWork) {
  const l = ledger(); const result = await runReservedAI(l.store, work, context);
  expect(result).toEqual({ ok: false, error: "AI could not complete the request. No successful usage was charged." });
  expect(l.counters).toEqual({ used: 0, pending: 0, saved: 0 }); expect(l.state()).toBe("failed");
  expect(JSON.stringify(logs.mock.calls)).not.toContain(sensitive);
  const records = logs.mock.calls.map(call => JSON.parse(String(call[0])));
  expect(records.at(-1)).toMatchObject({ stage: "release", code: "released", ...context });
  return records;
}
const response = (text: string, finishReason = "STOP") => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
describe("Offline AI diagnostics and quota release", () => {
  it("missing key releases without any provider call", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); const records = await fail(); expect(fetchMock).not.toHaveBeenCalled(); expect(records[0]).toMatchObject({ stage: "config", code: "missing_key" });
  });
  it.each([400,401,403,404,429,500])("provider HTTP %i releases once and never logs body/message", async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: sensitive, details: [sensitive] } }), { status }));
    const records = await fail(); expect(fetchMock).toHaveBeenCalledTimes(1); expect(records[0]).toMatchObject({ stage: "provider", providerStatus: status, code: "RESOURCE_EXHAUSTED", model: "gemini-3.6-flash" });
  });
  it("retries a 503 once with backoff, explicit Gemini 3.6 model and JSON output", async () => {
    vi.stubEnv("GEMINI_MODEL", "");
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }))
      .mockResolvedValueOnce(response('{"recipes":[]}'));
    const text = await streamResponseText([{ type: "input_text", text: "eggs and tomatoes" }]);
    expect(text).toBe('{"recipes":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/models/gemini-3.6-flash:generateContent");
    const options = fetchMock.mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(String(options.body));
    expect(payload.generationConfig).toEqual({ maxOutputTokens: 8192, responseMimeType: "application/json" });
    expect(payload.generationConfig).not.toHaveProperty("temperature");
  });
  it("does not retry a persistent 503 more than once", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }));
    const records = await fail();
    expect(records[0]).toMatchObject({ stage: "provider", providerStatus: 503, code: "UNAVAILABLE", model: "gemini-3.6-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("redacts malicious provider code and transport exception", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: sensitive, message: sensitive } }), { status: 403 }));
    expect((await fail())[0].code).toBe("unknown");
    logs.mockClear();
    fetchMock.mockRejectedValueOnce(new Error("https://provider.invalid?key=" + sensitive));
    expect((await fail())[0].code).toBe("transport_error");
  });
  it("invalid JSON releases reservation", async () => {
    fetchMock.mockResolvedValue(response("not JSON " + sensitive)); expect((await fail())[0]).toMatchObject({ stage: "parse", code: "invalid_json" });
  });
  it.each(["MAX_TOKENS", "SAFETY"])("empty/incomplete %s releases reservation", async reason => {
    fetchMock.mockResolvedValue(response(reason === "MAX_TOKENS" ? "{}" : "", reason)); expect((await fail())[0]).toMatchObject({ stage: "provider", finishReason: reason });
  });
  it("schema failure releases and logs only paths, not validation values", async () => {
    fetchMock.mockResolvedValue(response(JSON.stringify({ recipes: [{ title: sensitive }] })));
    const records = await fail(async () => z.object({ recipes: z.array(recipeSchema).length(3) }).parse(await providerWork()));
    expect(records[0].stage).toBe("validation"); expect(records[0].issuePaths.length).toBeLessThanOrEqual(12);
  });
  it("success charges once, saves three and duplicate never calls provider", async () => {
    fetchMock.mockResolvedValue(response('{"ok":true,"recipes":[{},{},{}]}'));
    const l = ledger(); await runReservedAI(l.store, providerWork, context); await runReservedAI(l.store, providerWork, context);
    expect(l.counters).toEqual({ used: 1, pending: 0, saved: 3 }); expect(fetchMock).toHaveBeenCalledTimes(1); expect(logs).not.toHaveBeenCalled();
  });
  it("failed duplicate returns result with no provider retry", async () => {
    const l = ledger(); await runReservedAI(l.store, providerWork, context); await runReservedAI(l.store, providerWork, context);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(l.counters.pending).toBe(0); expect(l.counters.used).toBe(0);
  });
  it("release persistence failure is logged safely, not claimed released", async () => {
    const l = ledger(); const store = { ...l.store, finish: async () => { throw Error(sensitive); } };
    await expect(runReservedAI(store, providerWork, context)).rejects.toThrow(sensitive);
    expect(l.counters.pending).toBe(1); expect(l.counters.used).toBe(0);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(sensitive);
    expect(JSON.parse(String(logs.mock.calls.at(-1)?.[0]))).toMatchObject({ stage: "release", code: "release_failed" });
  });
  it("sanitizes unknown metadata, hostile schema paths and correlation IDs", () => {
    const error = new z.ZodError([{ code: "custom", path: [sensitive, 99999, "recipes", 0], message: sensitive }]);
    logAIError(error, { requestId: sensitive, kind: sensitive });
    logAIError({ diagnostic: { stage: sensitive, model: sensitive, finishReason: sensitive, status: 99999, code: sensitive }, message: sensitive });
    expect(JSON.stringify(logs.mock.calls)).not.toContain(sensitive);
    expect(JSON.parse(String(logs.mock.calls[0][0])).issuePaths).toEqual([["other","other","recipes",0]]);
  });
  it("malformed diagnostic metadata cannot prevent release", async () => {
    const l = ledger(); const hostile = Object.defineProperty({}, "diagnostic", { get() { throw Error(sensitive); } });
    expect(await runReservedAI(l.store, async () => { throw hostile; }, context)).toMatchObject({ ok: false });
    expect(l.counters.pending).toBe(0); expect(l.counters.used).toBe(0);
  });
  it("logging failure cannot prevent quota release", async () => {
    logs.mockImplementation(() => { throw Error("logger unavailable"); }); const l = ledger();
    expect(await runReservedAI(l.store, providerWork, context)).toMatchObject({ ok: false }); expect(l.counters.pending).toBe(0);
  });
});
