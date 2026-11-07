# Recipe photos
- [x] Replace generic recipe images with specific Pixabay food searches (landscape, safesearch).
- [x] Securely request PIXABAY_API_KEY and verify live search when supplied.
- [x] Add shared lazy-loaded images, persistent per-recipe caching, skeletons, and ingredient emoji fallbacks across results, details, and favorites.
- [x] Verify photo behavior and preserve the existing design.

# Fridgie Plus (€3.99/month)
- [x] Fix preview type errors and verify automatic build; test expiry and server preference authorization without publishing.
- [x] Subscriptions table + server-side entitlement check.
- [x] Email login page (/auth).
- [x] Plus upgrade page with clear price + cancellation terms; truthful disabled checkout until payments are enabled.
- [x] Weekly meal planner, aggregated shopping list, dietary/serving preferences (Plus-gated).
- [x] Home nav entry; preferences passed into recipe suggestions only with server-verified Plus.
- [x] Tests + build verification; mobile home and signed-out Plus routes checked.
- [ ] Live photo → recipes: blocked by missing GEMINI_API_KEY in preview secure settings.
- [ ] Signed-in Plus UI verification: blocked by no existing auth users/session; sign in or create an account in preview.
- [ ] Blocked on user: enable built-in Stripe payments via the Lovable editor chat, then wire checkout, customer portal, and verified webhooks.
