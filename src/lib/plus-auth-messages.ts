type AuthSendError = { code?: string | undefined; status?: number | undefined };
export const EMAIL_REQUEST_ACCEPTED =
  "Your sign-in email request was accepted. Check your inbox and spam folder for the link. This does not confirm inbox delivery.";
export function plusSignInError(error: AuthSendError | null | undefined): string {
  if (error?.code === "over_email_send_rate_limit")
    return "Email delivery is temporarily rate-limited. Please wait before trying again. No new sign-in link was sent for this attempt.";
  if (error?.status === 429 || ["over_request_rate_limit", "over_security_request_rate_limit"].includes(error?.code ?? ""))
    return "Too many sign-in requests. Please wait before trying again.";
  if (error?.code === "email_address_invalid") return "Please enter a valid email address.";
  if (error?.code === "email_address_not_authorized")
    return "This email address is not allowed by the test email provider. Contact the operator.";
  if (["signup_disabled", "email_provider_disabled"].includes(error?.code ?? ""))
    return "Email sign-in is disabled in this test environment. Contact the operator.";
  return "We could not request a sign-in email. Please try again later.";
}
// Never display a provider's raw message, URL, token, recipient or response body.
// Tests inject a fake sender; this helper never sends or retries on its own.
export async function sendPlusEmailRequest(
  send: () => Promise<{ error: AuthSendError | null }>,
): Promise<string> {
  let result: { error: AuthSendError | null };
  try {
    result = await send();
  } catch {
    throw Error(plusSignInError(null));
  }
  if (result.error) throw Error(plusSignInError(result.error));
  return EMAIL_REQUEST_ACCEPTED;
}
