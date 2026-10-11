// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { EMAIL_REQUEST_ACCEPTED, plusSignInError, sendPlusEmailRequest } from "./plus-auth-messages";
describe("Plus English copy", () => {
  it("keeps all Plus-only UI and server messages in English", () => {
    for (const name of ["../routes/plus.tsx", "plus-client.ts", "plus-api.server.ts", "plus-core.server.ts"]) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8");
      expect(source).not.toMatch(/[\u0370-\u03ff]/);
    }
    const page = readFileSync(new URL("../routes/plus.tsx", import.meta.url), "utf8");
    expect(page).toContain('lang="en"');
    expect(page).toContain("Your week, sorted.");
    expect(page).toContain("Sign in by email");
    expect(page).toContain('toLocaleDateString("en-GB")');
    const account = readFileSync(new URL("../routes/account.tsx", import.meta.url), "utf8");
    expect(account).toContain("component: PlusPage");
  });
});
describe("Plus sign-in messaging without real email/network", () => {
  it("explains the verified email send limit", () => {
    expect(plusSignInError({code:"over_email_send_rate_limit",status:429})).toContain("Email delivery is temporarily rate-limited");
  });
  it("does not infer an email-delivery-specific limit from any 429", () => {
    expect(plusSignInError({status:429})).toBe("Too many sign-in requests. Please wait before trying again.");
  });
  it("maps invalid/unauthorized/disabled email errors safely", () => {
    expect(plusSignInError({code:"email_address_invalid"})).toContain("valid email");
    expect(plusSignInError({code:"email_address_not_authorized"})).toContain("not allowed");
    expect(plusSignInError({code:"signup_disabled"})).toContain("disabled");
    expect(plusSignInError({code:"email_provider_disabled"})).toContain("disabled");
  });
  it("never exposes a raw provider message, link or token", () => {
    const untrusted = {code:"unknown",message:"synthetic-private-token https://example.invalid/login"};
    expect(plusSignInError(untrusted)).not.toMatch(/synthetic-private-token|https:/);
  });
  it("provider acceptance is not claimed as inbox delivery", async () => {
    const fake = vi.fn().mockResolvedValue({error:null});
    expect(await sendPlusEmailRequest(fake)).toBe(EMAIL_REQUEST_ACCEPTED);
    expect(EMAIL_REQUEST_ACCEPTED).toContain("does not confirm inbox delivery");
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it("rate limit rejects instead of reporting success and does not retry", async () => {
    const fake = vi.fn().mockResolvedValue({error:{code:"over_email_send_rate_limit",status:429}});
    await expect(sendPlusEmailRequest(fake)).rejects.toThrow("No new sign-in link was sent");
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it("network failure is sanitized and never falsely succeeds", async () => {
    const fake = vi.fn().mockRejectedValue(Error("synthetic-private-token"));
    await expect(sendPlusEmailRequest(fake)).rejects.toThrow("We could not request a sign-in email");
    expect(fake).toHaveBeenCalledTimes(1);
  });
});
