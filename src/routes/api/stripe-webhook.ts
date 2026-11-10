import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripeWebhook } = await import("@/lib/billing.server");
        try {
          return await stripeWebhook(request);
        } catch {
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
