import type { Recipe } from './types';

export type RecipePhoto = { url: string; sourceUrl: string; photographer: string };
export type PhotoRecipe = Pick<Recipe, 'title' | 'uses'>;
const STOP = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'in', 'on', 'style', 'easy', 'quick', 'fresh', 'delicious', 'salt', 'oil', 'water']);
export function photoWords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))];
}
const PANTRY = new Set(['salt', 'pepper', 'oil', 'olive oil', 'water', 'butter', 'sugar', 'flour', 'garlic']);
export function mainIngredient(recipe: PhotoRecipe): string {
  const main = recipe.uses.find(x => !PANTRY.has(x.toLowerCase().trim())) ?? recipe.uses[0] ?? '';
  return photoWords(main).slice(-1)[0] ?? photoWords(recipe.title)[0] ?? '';
}
// Simple keyword searches first, then broader ones, before the emoji fallback.
export function recipePhotoQueries(recipe: PhotoRecipe): string[] {
  const main = mainIngredient(recipe);
  const second = photoWords(recipe.uses.filter(x => !PANTRY.has(x.toLowerCase().trim()))[1] ?? '').slice(-1)[0];
  return [...new Set([main && `${main} food`, main, second && `${second} food`, 'healthy meal'].filter(Boolean) as string[])];
}
export function recipePhotoQuery(recipe: PhotoRecipe): string { return recipePhotoQueries(recipe)[0] ?? ''; }
export function recipePhotoKey(recipe: PhotoRecipe): string {
  return JSON.stringify([recipe.title.toLowerCase().trim(), recipe.uses.map(x => x.toLowerCase().trim()).sort()]);
}
export function recipeEmoji(recipe: PhotoRecipe): string {
  const foods: [RegExp, string][] = [
    [/chicken|turkey/, '🍗'], [/beef|steak|pork|lamb/, '🥩'], [/salmon|fish|tuna/, '🐟'], [/shrimp|prawn/, '🦐'],
    [/egg/, '🍳'], [/pasta|spaghetti|noodle/, '🍝'], [/rice/, '🍚'], [/avocado/, '🥑'], [/potato/, '🥔'],
    [/broccoli/, '🥦'], [/carrot/, '🥕'], [/tomato/, '🍅'], [/cheese|cheddar/, '🧀'], [/spinach|lettuce|salad/, '🥬'], [/bean|lentil/, '🫘'],
  ];
  for (const ingredient of [...recipe.uses, recipe.title]) {
    const match = foods.find(([pattern]) => pattern.test(ingredient.toLowerCase()));
    if (match) return match[1];
  }
  return '🍽️';
}

export type PixabayHit = { id: number; tags: string; pageURL: string; webformatURL: string; user: string; imageWidth: number; imageHeight: number };
export function bestRecipePhoto(recipe: PhotoRecipe, hits: PixabayHit[], requireMain = true): PixabayHit | undefined {
  const main = mainIngredient(recipe);
  const words = [...photoWords(recipe.title), ...photoWords(recipe.uses.join(' '))];
  return hits.map(hit => {
    const tags = photoWords(hit.tags);
    const good = hit.imageWidth > hit.imageHeight && hit.imageWidth >= 640 && (!requireMain || tags.some(t => t.startsWith(main)));
    return { hit, good, score: words.filter(w => tags.includes(w)).length };
  }).filter(x => x.good).sort((a, b) => b.score - a.score)[0]?.hit;
}
