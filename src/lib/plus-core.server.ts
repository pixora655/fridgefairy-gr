import { logAIError } from "./plus-ai-diagnostics.server";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
export class PlusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function config(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env["FRIDGIE_PLUS_ENABLED"] === "true";
  const ready =
    enabled &&
    !!env["PLUS_SUPABASE_URL"] &&
    !!env["PLUS_SUPABASE_PUBLISHABLE_KEY"] &&
    !!env["PLUS_SUPABASE_SERVICE_ROLE_KEY"];
  const billing =
    ready &&
    env["PADDLE_ENVIRONMENT"] === "sandbox" &&
    env["PADDLE_SANDBOX_ENABLED"] === "true" &&
    env["PADDLE_API_KEY"]?.startsWith("pdl_sdbx_") &&
    !!env["PADDLE_PRICE_ID"] &&
    !!env["PADDLE_WEBHOOK_SECRET"];
  return { ready: Boolean(ready), billing: Boolean(billing) };
}
export function verifyWebhook(raw: string, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(";").map((p) => p.trim().split("="));
  const ts = parts.find((p) => p[0] === "ts")?.[1];
  if (!ts || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 5)
    throw new PlusError(401, "Invalid webhook");
  const expected = createHmac("sha256", secret)
    .update(ts + ":" + raw)
    .digest();
  const valid = parts
    .filter((p) => p[0] === "h1")
    .some((p) => {
      const h = p[1];
      if (!h || !/^[a-f0-9]{64}$/i.test(h)) return false;
      return timingSafeEqual(expected, Buffer.from(h, "hex"));
    });
  if (!valid) throw new PlusError(401, "Invalid webhook");
}
export const recipeSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(300),
  minutes: z.number().positive().max(300),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  category: z.enum(["pasta", "bowl", "stirfry", "eggs"]),
  uses: z.array(z.string().max(100)).max(40),
  missing: z.array(z.string().max(100)).max(2),
  steps: z.array(z.string().max(700)).min(4).max(7),
  tags: z.array(z.string().max(80)).max(10),
});
export const aiInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe"),
    id: z.string().uuid(),
    ingredients: z.array(z.string().min(1).max(40)).min(1).max(40),
    filters: z.array(z.string().max(20)).max(5),
  }),
  z.object({
    kind: z.literal("photo"),
    id: z.string().uuid(),
    image: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .max(8_000_000),
  }),
]);
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export const weekSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCDay() === 1;
  }, "Week must be a Monday");
export const shoppingSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(100), checked: z.boolean() }))
  .max(100);
export function shoppingFromRecipes(recipes: { missing: string[] }[]) {
  return [
    ...new Set(
      recipes
        .flatMap((r) => r.missing.map((s) => s.trim().toLocaleLowerCase("el")))
        .filter(Boolean),
    ),
  ].map((name) => ({ name, checked: false }));
}
export async function runReservedAI(
  store: {
    reserve: () => Promise<{ state: string; result?: unknown }>;
    finish: (success: boolean, result: unknown) => Promise<unknown>;
  },
  work: () => Promise<unknown>,
  diagnosticContext?: { requestId: string; kind: string },
) {
  const r = await store.reserve();
  if (r.state === "success" || r.state === "failed") return r.result;
  if (r.state !== "reserved")
    throw new PlusError(409, "This request is already running. Retry with the same ID.");
  let result: unknown;
  try {
    result = await work();
  } catch (error) {
    if (diagnosticContext) logAIError(error, diagnosticContext);
    try {
      const failed = await store.finish(false, {
        ok: false,
        error: "AI could not complete the request. No successful usage was charged.",
      });
      if (diagnosticContext) logAIError(null, diagnosticContext, { stage: "release", code: "released" });
      return failed;
    } catch (releaseError) {
      if (diagnosticContext) logAIError(null, diagnosticContext, { stage: "release", code: "release_failed" });
      throw releaseError;
    }
  }
  // Do not mark failed when persistence itself fails: conservatively retain reservation.
  return await store.finish(true, result);
}
