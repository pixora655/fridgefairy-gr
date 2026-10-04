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
