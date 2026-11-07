<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI calls go through src/lib/ai.server.ts (streamed Responses, server-only) and are exposed via src/lib/chef.functions.ts — keeps the key server-side.
- User data (favorites, cookbook, streak, invite) is local-first in src/lib/store.ts — swap for cloud sync later without touching UI.
- Recipe imagery uses a shared RecipeImage and server-only stock search with a persistent cache and private stored copies; this prevents mismatched category photos, duplicate searches, and permanent provider hotlinks.
- Plus entitlement is server-side only: the public.subscriptions row (RLS read-own) is read via getMyEntitlement in src/lib/plus.functions.ts; premium UI gates on that through useEntitlement/PlusGate, never on local state. Plus data (plan, shopping, prefs) stays local-first in src/lib/store.ts.
- Premium recipe preferences require a verified bearer and an unexpired active/trialing subscription in the recipe handler; ignore unverified preferences so the free generator remains public.
