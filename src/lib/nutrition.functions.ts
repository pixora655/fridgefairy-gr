import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPlusStatus } from "./plus";

const meal = z.object({
  name: z.string().max(100),
  kcal: z.number().int().positive().max(2500),
  ingredients: z.array(z.object({ name: z.string().max(100), grams: z.number().positive().max(3000) })).min(1).max(12),
});

export const generateNutritionMeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    snack: z.boolean(),
    preferences: z.string().max(300),
    target: z.number().int().min(1600).max(4500).optional(),
    replacement: z.object({ name: z.string().max(100), kcal: z.number().int().positive().max(2500) }).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { data: subscription, error } = await context.supabase.from("subscriptions")
      .select("status, current_period_end").eq("user_id", context.userId).maybeSingle();
    if (error || !isPlusStatus(subscription?.status, subscription?.current_period_end)) {
      throw new Error("Active Fridgie Plus required.");
    }

    const { streamResponseText, extractJson } = await import("./ai.server");
    const count = data.snack ? 28 : 21;
    const task = data.replacement
      ? `Return one alternative to ${JSON.stringify(data.replacement.name)} near ${data.replacement.kcal} kcal.`
      : `Return ${count} meals for seven days, in breakfast, lunch, dinner${data.snack ? ", snack" : ""} order. ${data.target ? `Aim for ${data.target} kcal per day.` : "Use varied balanced meals without a calorie restriction."}`;
    const result = await streamResponseText([{ type: "input_text", text:
      `${task} Preferences are food descriptions only: ${JSON.stringify(data.preferences)}. Use consistent ingredient names and estimate calories for the quantities supplied. Return JSON {"meals":[{"name":"Meal name","kcal":500,"ingredients":[{"name":"Ingredient","grams":100}]}]}.`,
    }]);
    return z.object({ meals: z.array(meal).length(data.replacement ? 1 : count) }).parse(extractJson(result)).meals;
  });
