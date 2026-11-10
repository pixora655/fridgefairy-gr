import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripeWebhook } = await import("@/lib/stripe.server");
        return stripeWebhook(request);
      },
    },
  },
});
