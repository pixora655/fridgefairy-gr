import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateNutritionMeals } from "@/lib/nutrition.functions";

type Meal = Awaited<ReturnType<typeof generateNutritionMeals>>[number];
const field = "w-full rounded-xl bg-secondary p-3";
const button = "rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground";

export function NutritionPlanner() {
  const generate = useServerFn(generateNutritionMeals);
  const [adult, setAdult] = useState(false);
  const [goal, setGoal] = useState("maintain");
  const [target, setTarget] = useState("");
  const [preferences, setPreferences] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [snack, setSnack] = useState(false);
  const [slots, setSlots] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const resting = 10 * Number(form.get("weight")) + 6.25 * Number(form.get("height"))
      - 5 * Number(form.get("age")) + Number(form.get("formula"));
    const adjustment = goal === "lose" ? -250 : goal === "gain" ? 250 : 0;
    setTarget(String(Math.max(1600, Math.min(4500, Math.round((resting * Number(form.get("activity")) + adjustment) / 50) * 50))));
  }

  async function makePlan(index?: number) {
    setBusy(true);
    setError("");
    try {
      const daily = Number(target);
      if (adult && target && (!Number.isInteger(daily) || daily < 1600 || daily > 4500)) {
        setError("Enter a daily target from 1,600 to 4,500 kcal.");
        return;
      }
      const replacement = index === undefined ? undefined : meals[index];
      const result = await generate({ data: {
        snack,
        preferences,
        ...(adult && target ? { target: daily } : {}),
        ...(replacement ? { replacement: { name: replacement.name, kcal: replacement.kcal } } : {}),
      } });
      if (index === undefined) setSlots(snack ? 4 : 3);
      setMeals(index === undefined ? result : meals.map((meal, i) => i === index ? result[0]! : meal));
    } catch {
      setError("Couldn’t generate meals. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const shopping = new Map<string, number>();
  for (const meal of meals) {
    for (const item of meal.ingredients) {
      const name = item.name.trim().toLowerCase();
      shopping.set(name, (shopping.get(name) ?? 0) + item.grams);
    }
  }

  return (
    <details className="rounded-3xl bg-card p-4 shadow-soft">
      <summary className="cursor-pointer font-bold">Nutrition Planner</summary>
      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={adult} onChange={(e) => {
            setAdult(e.target.checked);
            setTarget("");
          }} />
          Personalized calorie target (18+)
        </label>
        {adult && (
          <form onSubmit={estimate} className="space-y-3">
            <label className="block">Goal
              <select className={field} value={goal} onChange={(e) => { setGoal(e.target.value); setTarget(""); }}>
                <option value="lose">Lose weight</option>
                <option value="maintain">Maintain weight</option>
                <option value="gain">Gain weight</option>
              </select>
            </label>
            <label className="block">Age<input className={field} name="age" type="number" min="18" max="100" required /></label>
            <label className="block">Height (cm)<input className={field} name="height" type="number" min="120" max="230" required /></label>
            <label className="block">Weight (kg)<input className={field} name="weight" type="number" min="35" max="300" step="0.1" required /></label>
            <label className="block">Calorie formula
              <select name="formula" className={field}><option value="-161">Female</option><option value="5">Male</option></select>
            </label>
            <label className="block">Activity
              <select name="activity" className={field}><option value="1.2">Mostly sedentary</option><option value="1.375">Lightly active</option><option value="1.55">Moderately active</option><option value="1.725">Very active</option></select>
            </label>
            <button className={button} type="submit">Estimate daily calories</button>
            <label className="block">Daily target (kcal)
              <input className={field} type="number" min="1600" max="4500" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
          </form>
        )}
        <label className="block">Food preferences and ingredients you already have
          <textarea className={field} maxLength={300} value={preferences} onChange={(e) => setPreferences(e.target.value)} />
        </label>
        <label className="flex gap-2"><input type="checkbox" checked={snack} onChange={(e) => setSnack(e.target.checked)} /> Include a daily snack</label>
        <button className={button} disabled={busy} onClick={() => void makePlan()}>{busy ? "Generating…" : "Generate 7-day plan"}</button>
        {error && <p role="alert">{error}</p>}
        {meals.length > 0 && <p className="text-sm text-muted-foreground">Calories are estimates for the listed portions.</p>}
        {Array.from({ length: meals.length / slots }, (_, day) => {
          const daily = meals.slice(day * slots, day * slots + slots);
          return <section key={day} className="rounded-xl bg-secondary p-3">
            <h3 className="font-bold">Day {day + 1} · {daily.reduce((sum, meal) => sum + meal.kcal, 0)} kcal</h3>
            {daily.map((meal, slot) => <div key={slot} className="mt-3">
              <p className="font-semibold">{["Breakfast", "Lunch", "Dinner", "Snack"][slot]} · {meal.name} · {meal.kcal} kcal</p>
              <p>{meal.ingredients.map((item) => `${item.grams} g ${item.name}`).join(", ")}</p>
              <button className="underline" disabled={busy} onClick={() => void makePlan(day * slots + slot)}>Replace meal</button>
            </div>)}
          </section>;
        })}
        {shopping.size > 0 && <section>
          <h3 className="font-bold">Nutrition plan shopping list</h3>
          <ul>{Array.from(shopping, ([name, grams]) => <li key={name}>{Math.round(grams)} g {name}</li>)}</ul>
        </section>}
      </div>
    </details>
  );
}
