import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (new URL(request.url).hostname !== "deploy-preview-9--fridgefairy-gr.netlify.app") {
          return new Response(null, { status: 404 });
        }
        const { billingConfig, checkSandboxDependencies } = await import("@/lib/stripe.server");
        let message = "[Stripe] Sandbox configuration checks passed.";
        const config = billingConfig((reason) => { message = reason; });
        const problem = config ? await checkSandboxDependencies(config) : message;
        return new Response(problem ?? "[Stripe] Sandbox price and subscription database checks passed.", {
          status: problem ? 503 : 200,
          headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
        });
      },
      POST: async ({ request }) => {
        const { stripeWebhook } = await import("@/lib/stripe.server");
        return stripeWebhook(request);
      },
    },
  },
});
