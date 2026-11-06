import { useCallback, useEffect, useState } from "react";
import type { CookedEntry, Recipe } from "./types";
import { DEFAULT_PREFS, type Prefs } from "./plus";

export type ShopOverride = { qty: number; done: boolean; custom?: boolean };

// Local-first storage. Swap these helpers for a cloud sync later.
function useLocal<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setVal(JSON.parse(raw));
    } catch {}
  }, [key]);
  const set = useCallback(
    (next: T | ((p: T) => T)) =>
      setVal((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {}
        return v;
      }),
    [key],
  );
  return [val, set] as const;
}

const day = (d = new Date()) => d.toISOString().slice(0, 10);

export function useChefStore() {
  const [favorites, setFavorites] = useLocal<Recipe[]>("fc.favorites", []);
  const [cookbook, setCookbook] = useLocal<CookedEntry[]>("fc.cookbook", []);
  const [invited, setInvited] = useLocal<boolean>("fc.invited", false);
  // Plus features stay local-first like the rest of the store.
  const [prefs, setPrefs] = useLocal<Prefs>("fc.prefs", DEFAULT_PREFS);
  const [plan, setPlanMap] = useLocal<Record<string, Recipe>>("fc.plan", {});
  const [shopping, setShopping] = useLocal<Record<string, ShopOverride>>("fc.shopping", {});

  const setPlan = (day: string, r?: Recipe) =>
    setPlanMap((p) => {
      const n = { ...p };
      if (r) n[day] = r;
      else delete n[day];
      return n;
    });
  const setShopItem = (name: string, patch: Partial<ShopOverride>) =>
    setShopping((p) => ({ ...p, [name]: { qty: 1, done: false, ...p[name], ...patch } }));
  const removeShopItem = (name: string) =>
    setShopping((p) => {
      const n = { ...p };
      delete n[name];
      return n;
    });

  const isFav = (r: Recipe) => favorites.some((f) => f.title === r.title);
  const toggleFav = (r: Recipe) =>
    setFavorites((p) => (p.some((f) => f.title === r.title) ? p.filter((f) => f.title !== r.title) : [r, ...p]));
  const cooked = (r: Recipe) => setCookbook((p) => [{ recipe: r, date: new Date().toISOString() }, ...p]);

  // Streak: consecutive days (ending today or yesterday) with at least one cooked meal.
  const days = new Set(cookbook.map((c) => c.date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  if (!days.has(day(d))) d.setDate(d.getDate() - 1);
  while (days.has(day(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const week: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const x = new Date();
    x.setDate(x.getDate() - i);
    week.push(days.has(day(x)));
  }

  return { favorites, isFav, toggleFav, cookbook, cooked, streak, week, invited, setInvited, prefs, setPrefs, plan, setPlan, shopping, setShopItem, removeShopItem };
}
