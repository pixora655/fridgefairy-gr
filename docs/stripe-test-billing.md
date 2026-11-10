# Fridgie Plus Stripe test billing

This branch supports test payments only. It does not enable real charging.
Use a separate test Supabase project: its subscription rows grant Plus access,
so never point this test deployment at the production entitlement database.

## Configure a test deployment

1. Apply existing migrations and `drizzle/migrations/0003_stripe_test_billing.sql`
   to the test Supabase project. The new RPC is callable only by service_role.
2. In Stripe test mode create Fridgie Plus with a recurring EUR 3.99/month
   price (one month, quantity 1, licensed usage). Do not enable adjustable
   quantity, discounts, automatic tax, or other plans in the test customer portal.
3. Configure server environment variables through your hosting secrets settings:
   `STRIPE_SECRET_KEY` (`sk_test_…` only), `STRIPE_PLUS_PRICE_ID` (`price_…`),
   `STRIPE_WEBHOOK_SECRET` (`whsec_…`), `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_URL` (deployment origin).
   Browser Supabase settings must use the same test project. Never put Stripe or
   service-role secrets in VITE variables or commit them.
4. Enable the Stripe test customer portal with cancellation at period end and
   payment-method updates. Disable plan switching. Add a test webhook endpoint
   at `https://YOUR-TEST-HOST/api/stripe-webhook` listening to
   `customer.subscription.created`, `.updated`, and `.deleted`.
5. For local forwarding use `stripe listen --forward-to
   localhost:3000/api/stripe-webhook` and that listener's signing secret.

## Manual acceptance checks

- Sign in and select Test subscribe. Use `4242 4242 4242 4242`, a future expiry,
  any CVC. Checkout must display EUR 3.99 recurring monthly and test mode.
- Plus appears only after a verified webhook updates the read-own row, never
  from the success query parameter. The page refreshes entitlement each minute.
- Cancel checkout: Plus remains inactive. Repeat subscribe: an existing
  subscription opens its portal instead of creating another subscription.
- Manage test subscription opens the account's portal. Cancel at period end:
  access stays until the period expires; immediate cancellation revokes access.
- Exercise failed payment, renewal, cancellation, retries and reversed webhook
  delivery order. Current subscription is retrieved from Stripe for every event.
- Invalid signatures and live events are rejected. Missing configuration fails
  closed. Changing the configured price to another currency, amount, billing
  interval or a live price must prevent checkout.

No Stripe or Supabase secrets are supplied by this repository. This change does
not deploy the app or apply migrations. End-to-end Stripe checks require the
above test configuration; unit tests use no payment credentials.
