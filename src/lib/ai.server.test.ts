import { afterEach, describe, expect, it, vi } from "vitest";
import { extractJson, streamResponseText } from "./ai.server";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Gemini backend", () => {
  it("parses fenced JSON", () => expect(extractJson('```json\n{"ingredients":["eggs"]}\n```')).toEqual({ingredients:["eggs"]}));
  it("rejects invalid JSON", () => expect(() => extractJson("not JSON")).toThrow("invalid answer"));
  it("requires a server-only key", async () => {vi.stubEnv("GEMINI_API_KEY", ""); await expect(streamResponseText([])).rejects.toThrow("not configured");});
  it("sends text and image to Gemini with key in header", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:'{"ingredients":["eggs"]}'}]}}]}), {status:200}));
    vi.stubGlobal("fetch",mock);
    expect(await streamResponseText([{type:"input_text",text:"Identify food"},{type:"input_image",image_url:"data:image/jpeg;base64,AAAA"}])).toContain("eggs");
    const [url, request] = mock.mock.calls[0]!;
    expect(url).not.toContain("test-key");expect(request.headers["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(request.body).contents[0].parts[1]).toEqual({inlineData:{mimeType:"image/jpeg",data:"AAAA"}});
  });
  it("handles rate limits without raw provider details", async () => {vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("private details",{status:429}))); await expect(streamResponseText([])).rejects.toThrow("Too many requests");});
  it("rejects truncated replies", async () => {vi.stubEnv("GEMINI_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:"{}"}]}}]}))));await expect(streamResponseText([])).rejects.toThrow("complete answer");});
});
