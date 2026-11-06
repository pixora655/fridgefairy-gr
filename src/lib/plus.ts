import type { Recipe } from "./types";

// Fridgie Plus — owner-set pricing. Payment authority is the server-side
// subscriptions table; nothing in here grants access by itself.
export const PLUS_PRICE_EUR = 3.99;
export const PLUS_PRICE_LABEL = "€3.99/month";

export const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Nut-free"] as const;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
export function isPlusStatus(status?: string | null): boolean {
  return !!status && ACTIVE_STATUSES.has(status);
}

export type Prefs = { dietary: string[]; servings: number };
export const DEFAULT_PREFS: Prefs = { dietary: [], servings: 2 };

export type ShoppingItem = { name: string; qty: number; done: boolean };

// Aggregate the "missing" ingredients of planned recipes into one shopping
// list: duplicates across recipes stack up as quantities.
export function buildShoppingList(recipes: Recipe[]): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();
  for (const r of recipes) {
    for (const m of r.missing) {
      const name = m.trim().toLowerCase();
      if (!name) continue;
      const existing = map.get(name);
      if (existing) existing.qty += 1;
      else map.set(name, { name, qty: 1, done: false });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Seven ISO dates (YYYY-MM-DD) starting from today — the planning week.
export function weekDays(from = new Date()): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
