import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Trash2 } from "lucide-react";
import { useChefStore } from "@/lib/store";
import { buildShoppingList, weekDays } from "@/lib/plus";
import { PlusGate } from "@/components/plus-gate";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/shopping")({
  head: () => ({
    meta: [
      { title: "Shopping list — Fridgie Plus" },
      { name: "description", content: "Your weekly plan's missing ingredients, merged into one smart shopping list." },
      { property: "og:title", content: "Shopping list — Fridgie Plus" },
      { property: "og:description", content: "Missing ingredients from your meal plan, merged automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShoppingPage,
});

function ShoppingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/plan" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="font-display text-2xl font-bold">Shopping list</div>
      </header>
      <PlusGate>
        <Shopping />
      </PlusGate>
    </div>
  );
}

function Shopping() {
  const store = useChefStore();
  const [draft, setDraft] = useState("");

  const planned = weekDays()
    .map((d) => store.plan[d])
    .filter((r): r is Recipe => !!r);
  const base = buildShoppingList(planned);
  const baseNames = new Set(base.map((b) => b.name));
  const items = [
    ...base.map((b) => ({ ...b, ...(store.shopping[b.name] ?? {}) })),
    ...Object.entries(store.shopping)
      .filter(([n, v]) => v.custom && !baseNames.has(n))
      .map(([name, v]) => ({ name, qty: v.qty, done: v.done, custom: true as const })),
  ];
  const checkedCount = items.filter((i) => i.done).length;

  const addCustom = () => {
    const v = draft.trim().toLowerCase();
    if (v) {
      store.setShopItem(v, { custom: true });
      setDraft("");
    }
  };

  return (
    <main className="flex flex-1 animate-rise flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Everything your planned meals still need, merged automatically. Adjust quantities and tick items off as you shop.
      </p>

      {items.length === 0 && (
        <div className="rounded-3xl bg-card p-6 text-center shadow-soft">
          <p className="font-semibold">Nothing to buy 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {planned.length ? "Your planned meals only use what you have." : "Plan some meals first and the list builds itself."}
          </p>
          {!planned.length && (
            <Link to="/plan" className="mt-4 inline-flex h-12 items-center rounded-full bg-primary px-6 font-bold text-primary-foreground">
              Open planner
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.name} className={`flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ${it.done ? "opacity-50" : ""}`}>
            <button
              onClick={() => store.setShopItem(it.name, { done: !it.done })}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${it.done ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              aria-label={it.done ? `Uncheck ${it.name}` : `Check ${it.name}`}
            >
              {it.done && <Check className="h-4 w-4" />}
            </button>
            <span className={`flex-1 font-semibold ${it.done ? "line-through" : ""}`}>{it.name}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => store.setShopItem(it.name, { qty: Math.max(1, it.qty - 1) })}
                className="grid h-8 w-8 place-items-center rounded-full bg-secondary"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-bold">{it.qty}</span>
              <button
                onClick={() => store.setShopItem(it.name, { qty: Math.min(99, it.qty + 1) })}
                className="grid h-8 w-8 place-items-center rounded-full bg-secondary"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {"custom" in it && it.custom && (
              <button onClick={() => store.removeShopItem(it.name)} className="grid h-8 w-8 place-items-center rounded-full bg-secondary" aria-label={`Remove ${it.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add your own item…"
          className="h-13 flex-1 rounded-full border-2 border-input bg-card px-5 py-3 outline-none focus:border-ring"
        />
        <button className="grid h-13 w-13 place-items-center rounded-full bg-secondary" aria-label="Add item">
          <Plus className="h-5 w-5" />
        </button>
      </form>

      {checkedCount > 0 && (
        <button
          onClick={() => items.filter((i) => i.done).forEach((i) => store.removeShopItem(i.name))}
          className="mx-auto text-sm font-semibold text-muted-foreground underline underline-offset-4"
        >
          Clear {checkedCount} checked {checkedCount === 1 ? "item" : "items"}
        </button>
      )}
    </main>
  );
}
