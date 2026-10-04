// Server-only helper: streams a Lovable AI Gateway Responses call and returns the final text.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const MODEL = "openai/gpt-6-astra";

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function streamResponseText(content: unknown[]): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayError(401, "AI is not configured.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string };
      msg = j.error?.message || j.message || msg;
    } catch {}
    if (res.status === 429) msg = "Too many requests right now — try again in a moment.";
    if (res.status === 402) msg = "AI credits ran out. Please add credits to keep cooking.";
    throw new GatewayError(res.status, msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data) as { type?: string; delta?: string; response?: { error?: { message?: string } } };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error")
          throw new GatewayError(500, ev.response?.error?.message || "AI failed to respond.");
      } catch (e) {
        if (e instanceof GatewayError) throw e;
      }
    }
  }
  if (!out.trim()) throw new GatewayError(500, "The AI couldn't produce an answer for this one.");
  return out;
}

export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
