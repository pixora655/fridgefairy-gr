import { z } from "zod";
export type AIStage = "config" | "provider" | "parse" | "validation" | "release";
export type AIDetails = { stage: AIStage; status?: number; code?: string; model?: string; finishReason?: string };
const codes = new Set(["INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED", "missing_key", "transport_error", "empty_response", "invalid_json", "invalid_ingredients", "release_failed", "released", "unknown"]);
export function safeDiagnosticCode(value: unknown): string { return typeof value === "string" && codes.has(value) ? value : "unknown"; }
const models = new Set(["gemini-3.5-flash", "gemini-3.6-flash"]);
const reasons = new Set(["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL"]);
const fields = new Set(["recipes", "ingredients", "title", "description", "minutes", "difficulty", "category", "uses", "missing", "steps", "tags"]);
// Only known metadata is emitted. Never stringify an exception, message, stack or payload.
export function logAIError(error: unknown, context?: { requestId: string; kind: string }, override?: AIDetails) {
  try {
  const owned = error && typeof error === "object" && "diagnostic" in error ? (error as { diagnostic?: AIDetails }).diagnostic : undefined;
  const d = override ?? owned;
  const stage = d && ["config", "provider", "parse", "validation", "release"].includes(d.stage) ? d.stage : error instanceof z.ZodError ? "validation" : error instanceof SyntaxError ? "parse" : "validation";
  const record: Record<string, unknown> = { event: "fridgie_plus_ai_diagnostic", stage, code: safeDiagnosticCode(d?.code) };
  if (context && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.requestId)) record.requestId = context.requestId;
  if (context && ["recipe", "photo"].includes(context.kind)) record.kind = context.kind;
  if (d && Number.isInteger(d.status) && d.status! >= 100 && d.status! <= 599) record.providerStatus = d.status;
  const model = d?.model ?? (process.env["GEMINI_MODEL"] || "gemini-3.5-flash");
  record.model = typeof model === "string" && models.has(model) ? model : "other";
  if (d && typeof d.finishReason === "string") record.finishReason = reasons.has(d.finishReason) ? d.finishReason : "other";
  if (error instanceof z.ZodError) record.issuePaths = error.issues.slice(0, 12).map(issue => issue.path.slice(0, 8).map(part => typeof part === "number" && Number.isInteger(part) && part >= 0 && part < 300 ? part : typeof part === "string" && fields.has(part) ? part : "other"));
  // Logging is best effort and must not prevent quota release.
  console.error(JSON.stringify(record));
  } catch { /* malformed metadata/logger must never affect quota */ }
}
