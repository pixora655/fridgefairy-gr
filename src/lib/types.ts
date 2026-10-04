export type Recipe = {
  title: string;
  description: string;
  minutes: number;
  difficulty: "Easy" | "Medium" | "Hard";
  category: "pasta" | "bowl" | "stirfry" | "eggs";
  uses: string[];
  missing: string[];
  steps: string[];
  tags: string[];
};

export type CookedEntry = { recipe: Recipe; date: string; photo?: string };

export const FILTERS = ["Quick", "Healthy", "Cheap", "High-protein", "Vegetarian"] as const;
