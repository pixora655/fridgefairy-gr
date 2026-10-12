import { safeDiagnosticCode, type AIDetails } from "./plus-ai-diagnostics.server";
// Server-only Gemini helper. Never expose GEMINI_API_KEY in VITE_* variables.
export class GatewayError extends Error {
  constructor(public status: number, message: string, public diagnostic?: AIDetails) { super(message); }
}

type InputPart = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

// Preserve the server-function interface while replacing Lovable's gateway.
export async function streamResponseText(content: InputPart[]): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new GatewayError(503, "AI is not configured.", { stage: "config", code: "missing_key" });
  const model = process.env["GEMINI_MODEL"] || "gemini-3.5-flash";
  const parts = content.map((part) => {
    if (part.type === "input_text") return { text: part.text };
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(part.image_url);
    if (!match) throw new GatewayError(400, "Please use a JPEG, PNG or WebP image.");
    return { inlineData: { mimeType: match[1]!, data: match[2]! } };
  });
  let res: Response;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: "application/json" },
      }),
    });
  } catch {
    throw new GatewayError(504, "The AI took too long to respond. Please try again.", { stage: "provider", code: "transport_error", model });
  }
  if (!res.ok) {
    // Read only the provider status enum; never keep/log its message or payload.
    let code = "unknown";
    try { const errorBody = await res.json(); code = safeDiagnosticCode(errorBody?.error?.status); } catch { /* no raw fallback */ }
    const diagnostic: AIDetails = { stage: "provider", status: res.status, code, model };
    // Do not return raw provider errors or credentials to the browser.
    if (res.status === 429) throw new GatewayError(429, "Too many requests right now — try again in a moment.", diagnostic);
    if ([400, 401, 403].includes(res.status)) throw new GatewayError(res.status, "AI configuration needs attention. Please contact support.", diagnostic);
    throw new GatewayError(res.status, "AI request failed (" + res.status + "). Please try again.", diagnostic);
  }
  const data = await res.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? "").join("");
  if (!text.trim() || candidate?.finishReason === "MAX_TOKENS") throw new GatewayError(502, "The AI couldn't produce a complete answer. Please try again.", { stage: "provider", code: "empty_response", model, finishReason: candidate?.finishReason });
  return text;
}

export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new GatewayError(502, "The AI returned an invalid answer. Please try again.", { stage: "parse", code: "invalid_json" });
  try { return JSON.parse(text.slice(start, end + 1)) as T; }
  catch { throw new GatewayError(502, "The AI returned an invalid answer. Please try again.", { stage: "parse", code: "invalid_json" }); }
}
