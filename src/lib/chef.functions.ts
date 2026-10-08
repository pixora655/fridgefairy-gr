import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const recipeSchema = z.object({
  title: z.string().min(1).max(160), description: z.string().max(300),
  minutes: z.number().positive().max(300), difficulty: z.enum(["Easy", "Medium", "Hard"]),
  category: z.enum(["pasta", "bowl", "stirfry", "eggs"]),
  uses: z.array(z.string().max(100)).max(40), missing: z.array(z.string().max(100)).max(2),
  steps: z.array(z.string().max(700)).min(4).max(7), tags: z.array(z.string().max(80)).max(10),
});

export const detectIngredients = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { streamResponseText, extractJson } = await import("./ai.server");
    try {
      const text = await streamResponseText([
        {
          type: "input_text",
          text: 'List the food ingredients visible in this fridge/pantry photo. Use short, common lowercase names (e.g. "eggs", "spinach", "cheddar"). Ignore non-food items. Reply ONLY with JSON: {"ingredients": string[]}. If none are visible return an empty array.',
        },
        { type: "input_image", image_url: data.image },
      ]);
      const parsed = z.object({ ingredients: z.array(z.string().min(1).max(80)).max(30) }).parse(extractJson<unknown>(text));
      return { ok: true as const, ingredients: (parsed.ingredients ?? []).slice(0, 30) };
    } catch (e) {
      return { ok: false as const, error: e instanceof z.ZodError ? "The AI returned an incomplete answer. Please try again." : e instanceof Error ? e.message : "Detection failed" };
    }
  });

export const suggestRecipes = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        ingredients: z.array(z.string().max(40)).min(1).max(40),
        filters: z.array(z.string().max(20)).max(5),
        bonus: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { streamResponseText, extractJson } = await import("./ai.server");
    try {
      const text = await streamResponseText([
        {
          type: "input_text",
          text: `You are a friendly home chef for busy young people. Available ingredients: ${data.ingredients.join(", ")}. Assume basic pantry staples exist (salt, pepper, oil, water).
Filters: ${data.filters.length ? data.filters.join(", ") : "none"} (Quick = under 15 min).
${data.bonus ? "Make the recipes a bit more creative/restaurant-style." : ""}
Suggest exactly 3 recipes. Recipes 1-2 must use ONLY the available ingredients (missing = []). Recipe 3 may need 1-2 extra ingredients listed in "missing".
Reply ONLY with JSON: {"recipes":[{"title":string,"description":string (max 15 words),"minutes":number,"difficulty":"Easy"|"Medium"|"Hard","category":"pasta"|"bowl"|"stirfry"|"eggs","uses":string[],"missing":string[],"steps":string[] (4-7 short steps),"tags":string[]}]}`,
        },
      ]);
      const parsed = z.object({ recipes: z.array(recipeSchema).length(3) }).parse(extractJson<unknown>(text));
      if (parsed.recipes.slice(0, 2).some(r => r.missing.length > 0)) throw new Error("The AI suggested extra ingredients. Please try again.");
      return { ok: true as const, recipes: parsed.recipes.slice(0, 3) };
    } catch (e) {
      return { ok: false as const, error: e instanceof z.ZodError ? "The AI returned an incomplete answer. Please try again." : e instanceof Error ? e.message : "Couldn't get recipes" };
    }
  });
