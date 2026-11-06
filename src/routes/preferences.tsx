import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, Users } from "lucide-react";
import { useChefStore } from "@/lib/store";
import { DIETARY_OPTIONS } from "@/lib/plus";
import { PlusGate } from "@/components/plus-gate";

export const Route = createFileRoute("/preferences")({
  head: () => ({
    meta: [
      { title: "Dietary & servings — Fridgie Plus" },
      { name: "description", content: "Set dietary needs and servings; Fridgie applies them to every recipe suggestion." },
      { property: "og:title", content: "Dietary & servings — Fridgie Plus" },
      { property: "og:description", content: "Set dietary needs and servings for your Fridgie recipes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreferencesPage,
});

function PreferencesPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/plus" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="font-display text-2xl font-bold">Preferences</div>
      </header>
      <PlusGate>
        <Prefs />
      </PlusGate>
    </div>
  );
}

function Prefs() {
  const store = useChefStore();
  const { dietary, servings } = store.prefs;

  return (
    <main className="flex flex-1 animate-rise flex-col gap-6">
      <section>
        <h2 className="text-xl font-bold">Dietary needs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every new batch of dinner ideas will respect these.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((d) => {
            const on = dietary.includes(d);
            return (
              <button
                key={d}
                onClick={() =>
                  store.setPrefs((p) => ({ ...p, dietary: on ? p.dietary.filter((x) => x !== d) : [...p.dietary, d] }))
                }
                className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Servings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Recipes scale to how many people you're cooking for.</p>
        <div className="mt-3 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
          <Users className="h-7 w-7 text-primary" />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => store.setPrefs((p) => ({ ...p, servings: Math.max(1, p.servings - 1) }))}
              className="grid h-10 w-10 place-items-center rounded-full bg-secondary"
              aria-label="Fewer servings"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-display text-2xl font-bold">{servings}</span>
            <button
              onClick={() => store.setPrefs((p) => ({ ...p, servings: Math.min(6, p.servings + 1) }))}
              className="grid h-10 w-10 place-items-center rounded-full bg-secondary"
              aria-label="More servings"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <p className="rounded-2xl bg-accent p-3 text-sm font-semibold text-accent-foreground">
        Saved automatically — applied the next time you get dinner ideas.
      </p>
    </main>
  );
}
