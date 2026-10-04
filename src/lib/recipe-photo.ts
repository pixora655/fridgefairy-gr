import type { Recipe } from './types';

export type RecipePhoto = { url: string; sourceUrl: string; photographer: string };
export type PhotoRecipe = Pick<Recipe, 'title' | 'uses'>;
const STOP = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'in', 'on', 'style', 'easy', 'quick', 'fresh', 'delicious', 'salt', 'oil', 'water']);
export function photoWords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))];
}
export function recipePhotoQuery(recipe: PhotoRecipe): string {
  return [...new Set([...photoWords(recipe.title), ...photoWords(recipe.uses.slice(0, 4).join(' '))])].join(' ').slice(0, 100);
}
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
export function bestRecipePhoto(recipe: PhotoRecipe, hits: PixabayHit[]): PixabayHit | undefined {
  const title = photoWords(recipe.title);
  const ingredients = photoWords(recipe.uses.slice(0, 4).join(' '));
  return hits.map(hit => {
    const tags = new Set(photoWords(hit.tags));
    const titleMatches = title.filter(w => tags.has(w)).length;
    const ingredientMatches = ingredients.filter(w => tags.has(w)).length;
    const good = hit.imageWidth > hit.imageHeight && hit.imageWidth >= 640
      && titleMatches >= Math.max(2, Math.ceil(title.length * 0.65))
      && ingredientMatches >= Math.max(1, Math.ceil(ingredients.length * 0.6));
    return { hit, good, score: titleMatches * 3 + ingredientMatches };
  }).filter(x => x.good).sort((a, b) => b.score - a.score)[0]?.hit;
}