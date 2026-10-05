import { describe, expect, it } from 'vitest';
import { bestRecipePhoto, recipeEmoji, recipePhotoKey, recipePhotoQuery, recipePhotoQueries, type PixabayHit } from '@/lib/recipe-photo';

const recipe = { title: 'Peppery butter chicken bites stir fry', uses: ['chicken', 'butter', 'pepper'] };
function hit(tags: string, id = 1): PixabayHit {
  return { id, tags, pageURL: 'https://pixabay.com/photos/example-1/', webformatURL: 'https://cdn.pixabay.com/photo.jpg', user: 'Chef', imageWidth: 1200, imageHeight: 800 };
}
describe('Recipe photos', () => {
  it('searches main ingredient + food, then broader queries', () => {
    expect(recipePhotoQuery({ title: 'Seared tuna bowl', uses: ['salt', 'tuna', 'rice'] })).toBe('tuna food');
    expect(recipePhotoQueries(recipe).at(-1)).toBe('healthy meal');
  });
  it('has stable identities for the same saved recipe', () => {
    expect(recipePhotoKey(recipe)).toBe(recipePhotoKey({ ...recipe, uses: ['pepper', 'butter', 'chicken'] }));
  });
  it('requires the main ingredient and landscape photos', () => {
    expect(bestRecipePhoto(recipe, [hit('salad, food')])).toBeUndefined();
    expect(bestRecipePhoto(recipe, [hit('food'), hit('chicken, stir fry', 2)])?.id).toBe(2);
    expect(bestRecipePhoto(recipe, [{ ...hit('chicken'), imageWidth: 800, imageHeight: 1200 }])).toBeUndefined();
  });
  it('chooses an emoji from the main ingredient', () => {
    expect(recipeEmoji(recipe)).toBe('🍗');
    expect(recipeEmoji({ title: 'Something new', uses: ['avocado', 'egg'] })).toBe('🥑');
  });
});