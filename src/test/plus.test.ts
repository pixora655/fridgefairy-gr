import { describe, expect, it } from "vitest";
import { PLUS_PRICE_EUR, PLUS_PRICE_LABEL, buildShoppingList, isPlusStatus, weekDays } from "../lib/plus";
import type { Recipe } from "../lib/types";

const recipe = (missing: string[]): Recipe => ({
  title: "Test dish",
  description: "",
  minutes: 10,
  difficulty: "Easy",
  category: "bowl",
  uses: [],
  missing,
  steps: ["a", "b", "c", "d"],
  tags: [],
});

describe("Plus price", () => {
  it("is €3.99 per month", () => {
    expect(PLUS_PRICE_EUR).toBe(3.99);
    expect(PLUS_PRICE_LABEL).toBe("€3.99/month");
  });
});

describe("isPlusStatus", () => {
  it("grants Plus only for active or trialing subscriptions", () => {
    expect(isPlusStatus("active")).toBe(true);
    expect(isPlusStatus("trialing")).toBe(true);
  });

  it("denies Plus for any other status", () => {
    for (const s of ["canceled", "past_due", "inactive", "", null, undefined]) {
      expect(isPlusStatus(s)).toBe(false);
    }
  });
});

describe("buildShoppingList", () => {
  it("aggregates missing ingredients across recipes and stacks quantities", () => {
    const list = buildShoppingList([recipe(["milk", "spinach"]), recipe(["Milk "]), recipe([])]);
    expect(list).toEqual([
      { name: "milk", qty: 2, done: false },
      { name: "spinach", qty: 1, done: false },
    ]);
  });

  it("returns an empty list when nothing is missing", () => {
    expect(buildShoppingList([recipe([])])).toEqual([]);
  });
});

describe("weekDays", () => {
  it("returns 7 consecutive ISO dates starting from the given day", () => {
    const days = weekDays(new Date("2026-11-06T10:00:00Z"));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-11-06");
    expect(days[6]).toBe("2026-11-12");
  });
});
