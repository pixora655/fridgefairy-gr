# Fridgie Plus — TEST branch only

This is executable MVP code, not activation of a subscription service. Do not merge or enable production billing based on this PR. Defaults are disabled. The original implementation did not run database migrations or change remote settings. The isolated test migration was subsequently applied by the parent on 2026-10-11 under separate authorization (see database status below). No real email was sent, no user account was created, and no Paddle payments were configured.

## What is implemented

- `/plus` and `/account`: Greek Plus UI, email magic-link sign-in, server subscription/usage state, recipe/photo requests, saved Plus recipes, seven weekly meal slots, editable shopping list, sandbox checkout/portal controls.
- €3.99/month including tax, **30 successful recipe-generation requests (three recipes per request)** and **30 successful photo detections**, separately counted per provider-verified paid billing period. Empty but valid detection is a successful request. No calendar-month reset, no rollover.
- Dedicated Netlify function `/.netlify/functions/plus`. Authorization uses Supabase `auth.getUser(token)` on the server, not a client entitlement flag. Every database read/write uses verified user ID. Server-only service key never goes into client variables.
- Atomic Postgres reservation/finish RPCs, advisory lock per user, row lock per cycle, result idempotency by request UUID + payload hash, separate pending slots, at most 60 attempts/user/hour including failed attempts. Concurrent 30th/31st requests cannot both consume the last slot. Validated AI failures release reservations and consume no successful usage. Recipe persistence and successful quota count are one SQL transaction.
- RLS enabled on all new tables; authenticated users get own-row SELECT only (no INSERT/UPDATE, no entitlement/quota RPC execution). Admin endpoints perform owner validation too.
- Plan/shopping save in one transaction. Plans only reference the authenticated user's saved Plus recipes. Shopping generation uses `missing` ingredients only, deduplicates names, does not invent quantities, makes no AI call. Lists can be edited/checked/deleted.
- Paddle sandbox only: fixed sandbox API base; explicit flags and sandbox API-key prefix; client token must start `test_`; server-selected recurring EUR price; server checkout ID mapped to verified user and provider transaction; no accepted client price/amount/user ID.
- Webhook raw-body HMAC SHA-256, constant-time signature comparison, five-second timestamp tolerance, event deduplication, transaction/subscription re-fetch from sandbox API, exact price/currency/paid-total validation, atomic paid-cycle reconciliation and monotonic subscription event timestamps. Duplicate paid periods do not reset counters; overlapping periods fail closed. Failed renewals/lifecycle notifications never create quota.
- Sandbox portal checks subscription/customer ownership. Scheduled cancellation shows through read-only provider reconciliation on account refresh; access remains until already-paid period ends. Payment status from checkout callbacks cannot grant access.

## Required configuration (names only, never commit values)

Use **isolated TEST Supabase/Paddle accounts/projects and Netlify deploy-preview scoped variables**, not existing production project settings. The old Supabase project reference found in repository config has not been verified and is not used automatically by Plus.

Server/runtime:

| Name                             | Purpose                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FRIDGIE_PLUS_ENABLED`           | Exact `true` to enable configured Plus API; otherwise fail closed                                                                                   |
| `PLUS_SUPABASE_URL`              | Isolated Supabase test URL                                                                                                                          |
| `PLUS_SUPABASE_PUBLISHABLE_KEY`  | Test project's public key (reserved for config parity)                                                                                              |
| `PLUS_SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role/secret key, NEVER VITE-prefixed                                                                                            |
| `GEMINI_API_KEY`                 | Existing server-only AI provider configuration                                                                                                      |
| `GEMINI_MODEL`                   | Optional existing model setting                                                                                                                     |
| `PADDLE_SANDBOX_ENABLED`         | Exact `true`                                                                                                                                        |
| `PADDLE_ENVIRONMENT`             | Exact `sandbox`; any other value disables billing                                                                                                   |
| `PADDLE_API_KEY`                 | Sandbox API key (`pdl_sdbx_` prefix); minimal transactions/prices/subscriptions read, transactions write, customer portal session write permissions |
| `PADDLE_PRICE_ID`                | Server-selected sandbox price; client cannot override                                                                                               |
| `PADDLE_WEBHOOK_SECRET`          | Sandbox notification destination secret                                                                                                             |

Build-time public values:

- `VITE_PLUS_SUPABASE_URL`
- `VITE_PLUS_SUPABASE_PUBLISHABLE_KEY` (matching server test project)
- `VITE_PADDLE_CLIENT_TOKEN` (sandbox public client token, `test_` prefix)

Do not put provider API/service-role keys in VITE variables. Do not inspect or paste secret values into chat/logs. Setting all flags is not enough: SQL migration, auth redirect allowlist, price, notification destination, API permissions, and default payment URL must be configured by an authorized operator.

## SQL migration — applied to isolated TEST project on 2026-10-11

`supabase/migrations/20261009190000_fridgie_plus.sql`

On 2026-10-11 the parent, under newly granted isolated-test authorization, corrected the `plus_save_plan` single-dollar delimiter syntax defect to paired `$` delimiters and successfully applied this migration to FREE Supabase project `ksufrkbbfargigpnffzn` (`fridgie-plus-test`, Frankfurt, organization `zxgclzqmpbpfhlsmtfcu`). Parent verified all eight tables with RLS enabled and zero rows. Advisors reported INFO only for intentionally server-only `plus_checkouts` / `plus_events` having no client policies. This follow-up performs no database or remote-settings actions. No users, email delivery, Paddle or end-to-end flows are configured/tested; live quota concurrency and authenticated RLS isolation remain unverified.

For any other project, review in a disposable test project first. Tables: `plus_subscriptions`, `plus_cycles`, `plus_usage_requests`, `plus_recipes`, `plus_meal_plans`, `plus_shopping_lists`, `plus_checkouts`, `plus_events`. RPCs: `plus_reserve`, `plus_finish`, `plus_apply_payment`, `plus_save_plan`. Migration is transactional but intentionally not tied to deploy build. No further remote database access/settings changes are authorized by this corrective follow-up.

Sign-in uses a separate `fridgie-plus-auth` browser storage key and Supabase PKCE URL handling at `/plus`. An authorized operator must configure email OTP/magic link delivery and redirect allowlist for the exact deploy-preview `/plus` URL. Auth creates accounts only when an actual future user requests sign-in; no implementation test sends emails or creates accounts. Supabase should enforce email request rate limits and email verification.

## Paddle sandbox setup — requires separate authorization

1. Configure sandbox product + active monthly recurring price: `unit_price.amount = "399"`, `currency_code = "EUR"`, `billing_cycle.interval = "month"`, `frequency = 1`, no trial, `tax_mode = "internal"` (tax-inclusive). Do not use discounts, alternate quantity, localized currency conversion or price overrides: verification rejects totals other than EUR 399 cents.
2. Configure an approved sandbox default payment URL appropriate for Paddle.js and a public sandbox client token. Client loads only Paddle's official v2 script and explicitly sets environment to sandbox; checkout opens the server-created transaction ID. No client product/price overrides are passed.
3. Configure sandbox notification destination: `https://<exact-preview-host>/.netlify/functions/plus?action=webhook`, subscribe at least to `transaction.completed`; additional lifecycle/failed-payment events are verified and ignored for quota grants.
4. Ensure webhook signing clocks are synchronized (5-second tolerance). Provider retries/replay delivery can safely resend a completed event. Invalid signature/body is rejected before any entitlement write.
5. Run sandbox matrix below before enabling access even on test deployment. Production is deliberately unsupported by this branch.

## Verification already performed locally

`node node_modules/vite/bin/vite.js build`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run` use existing cached dependencies. No large toolchain/package installation. The existing npm PowerShell entrypoint hung; direct Node entrypoints were used instead. Initial strict-null TypeScript errors and Node test setup's unguarded `window` were fixed before the passing rerun.

Latest local result: **61 tests passed in 7 files**, TypeScript passed and Vite client/SSR build passed. An additional standalone esbuild function packaging smoke check was attempted twice but blocked by this Windows native sandbox filesystem (`Access is denied` while traversing parent directories). Actual Netlify function packaging/deployment still needs deploy-preview verification.

Tests cover fail-closed flags, HMAC body tampering/replay, invalid/duplicate webhooks, failed renewal, provider total mismatch, verified reconciliation RPC arguments, checkout ownership, invalid auth, cross-origin writes, account owner filters, plan/shopping atomic edits and foreign recipe rejection. Quota concurrency/30th/31st/cycle-reset tests are a deterministic **contract model**, and migration RLS/locking/dedup checks are **static**. They are not a PostgreSQL/RLS runtime integration test. The parent subsequently confirmed successful migration application and empty-table RLS checks, not authenticated isolation/quota concurrency. Two new delimiter regression tests verify paired `$` quoting and reject the original single-dollar `plus_save_plan` defect.

## Required sandbox/integration matrix (NOT executed)

| Scenario                                                                          | Expected                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| No config / wrong live flags/key / no public sandbox token                        | UI and checkout disabled; private endpoints fail closed                     |
| User A/B sign in with real sandbox email delivery                                 | PKCE completes; signout clears visible Plus data; no shared private records |
| 31 concurrent requests of each kind in an actual Postgres paid cycle              | 30 reserved/success, 31st rejected; no overspend                            |
| Invalid AI / provider timeout                                                     | Failed request saved; counter unchanged; pending released                   |
| Lost HTTP response / exact UUID retry / altered payload retry                     | Stored result / pending conflict; altered payload rejected; no extra AI     |
| 61 failed attempts in one hour                                                    | Attempt-rate rejection independent of success quota                         |
| Direct anon/auth REST inserts or quota RPC calls                                  | Denied by SQL grants/RLS                                                    |
| User B tries User A recipes/plan/shopping/usage IDs                               | Rejected or no rows                                                         |
| Edit seven slots + checked/renamed/added/removed shopping items                   | Both persist atomically; refresh returns edits                              |
| Sandbox checkout completes without verified webhook                               | No entitlement                                                              |
| Valid completed sandbox transaction webhook twice / older event after newer       | One paid cycle, no reset/rollback                                           |
| Wrong price/quantity/currency/total/customer/unmapped checkout                    | No entitlement; webhook 422                                                 |
| Successful next renewal with provider billing period                              | New cycle 0/30 + 0/30; old IDs/results remain idempotent                    |
| Failed renewal / scheduled cancel                                                 | No new cycle; existing access ends at paid period boundary                  |
| Portal cancellation and account refresh                                           | Provider-confirmed scheduled cancel displayed, paid end preserved           |
| Mobile UI, magic-link callback, Paddle overlay and function origin behind Netlify | Must test on actual isolated preview                                        |

## Known limitations / release blockers

- The isolated test database migration now exists and passed application/table-RLS checks as reported above. Auth delivery and Paddle sandbox configuration are not activated; end-to-end flows, live SQL concurrency/authenticated isolation and deploy function routing are therefore not certified. Do not describe this as production-ready.
- New paid quotas protect only the dedicated Plus APIs. Existing Free `detectIngredients`/`suggestRecipes` remain available, unchanged, and are **not an enforceable premium AI paywall**. New Free limits were not authorized. Local Free favorites/history are not migrated/deleted.
- Reservations remain pending if a server crashes or result persistence fails after AI execution. This is conservative (no overspending), not automatic refund. An authorized operator must inspect a stuck request and only mark it failed once execution is definitively ended; no unsafe timeout auto-release is shipped.
- Webhook provider re-fetch is the payment reconciliation path; account refresh also re-fetches subscription display state. There is no scheduled reconciliation worker, dashboard event replay UI, automated receipt/refund/dispute handling or cancel-sync background job. Refund/dispute/chargeback revocation needs additional explicit policy and implementation before production billing.
- A different replacement subscription for the same user is rejected, rather than guessing migration/proration ownership. Re-subscribe after a fully canceled subscription requires an explicit reviewed follow-up; no second paid subscription should be started through this UI.
- Strict full EUR 399-cent recurring payments only: trials, discounts, prorations, price changes, alternate currencies, and overlapping paid periods fail closed rather than granting ambiguous allowance.
- Missing-ingredient names can be deduplicated, not unit/quantity-normalized. Saved-recipe UI lists latest 200 recipes; older plans remain stored, but selecting older recipes beyond that window needs pagination work.
- Production payments, production deploy/merge and remote settings changes were not performed or enabled.

## Reference contracts checked

- https://developer.paddle.com/api-reference/transactions/create-transaction/
- https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/
- https://developer.paddle.com/webhooks/about/signature-verification/
- https://developer.paddle.com/api-reference/prices/
