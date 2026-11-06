import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, ShoppingBasket, X } from "lucide-react";
import { useChefStore } from "@/lib/store";
import { weekDays, dayLabel } from "@/lib/plus";
import { PlusGate } from "@/components/plus-gate";
import { RecipeImage } from "@/components/recipe-image";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Weekly meal planner — Fridgie Plus" },
      { name: "description", content: "Plan your week of dinners from your generated and saved Fridgie recipes." },
      { property: "og:title", content: "Weekly meal planner — Fridgie Plus" },
      { property: "og:description", content: "Plan your week of dinners from your saved Fridgie recipes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/plus" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="font-display text-2xl font-bold">Weekly planner</div>
      </header>
      <PlusGate>
        <Planner />
      </PlusGate>
    </div>
  );
}

function Planner() {
  const store = useChefStore();
  const days = weekDays();
  const [pickDay, setPickDay] = useState<string | null>(null);
  const saved = [...store.cookbook.map((c) => c.recipe), ...store.favorites].filter(
    (r, i, a) => a.findIndex((x) => x.title === r.title) === i,
  );
  const plannedCount = days.filter((d) => store.plan[d]).length;

  return (
    <main className="flex flex-1 animate-rise flex-col gap-3">
      <p className="text-sm text-muted-foreground">Assign a recipe to each day from your cookbook and saved recipes.</p>
      {days.map((d) => {
        const r = store.plan[d];
        return (
          <div key={d} className="rounded-3xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div className="font-bold">{dayLabel(d)}</div>
              {r && (
                <button onClick={() => store.setPlan(d, undefined)} className="grid h-8 w-8 place-items-center rounded-full bg-secondary" aria-label="Remove from day">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {r ? (
              <div className="mt-2 flex items-center gap-3">
                <RecipeImage recipe={r} className="h-14 w-14 shrink-0 rounded-xl" credit={false} />
                <div>
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.minutes} min · {r.difficulty}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPickDay(pickDay === d ? null : d)}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-sm font-bold text-muted-foreground"
              >
                <Plus className="h-4 w-4" /> Add recipe
              </button>
            )}
            {pickDay === d && !r && (
              <div className="mt-3 space-y-2">
                {saved.length === 0 && (
                  <p className="text-sm text-muted-foreground">No saved recipes yet — snap your fridge and save a few first.</p>
                )}
                {saved.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => {
                      store.setPlan(d, s);
                      setPickDay(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-secondary p-2 text-left"
                  >
                    <RecipeImage recipe={s} className="h-10 w-10 shrink-0 rounded-lg" credit={false} />
                    <span className="text-sm font-semibold">{s.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Link
        to="/shopping"
        className="sticky bottom-4 mt-2 flex h-16 items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground shadow-pop"
      >
        <ShoppingBasket className="h-5 w-5" /> Shopping list{plannedCount ? ` (${plannedCount} meals)` : ""}
      </Link>
    </main>
  );
}
