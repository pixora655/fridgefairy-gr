import { describe, expect, it } from 'vitest';
import { bestRecipePhoto, recipeEmoji, recipePhotoKey, recipePhotoQuery, type PixabayHit } from '@/lib/recipe-photo';

const recipe = { title: 'Peppery butter chicken bites stir fry', uses: ['chicken', 'butter', 'pepper'] };
function hit(tags: string, id = 1): PixabayHit {
  return { id, tags, pageURL: 'https://pixabay.com/photos/example-1/', webformatURL: 'https://cdn.pixabay.com/photo.jpg', user: 'Chef', imageWidth: 1200, imageHeight: 800 };
}
describe('Recipe photos', () => {
  it('uses the dish name and ingredients, not a generic category', () => {
    const query = recipePhotoQuery({ title: 'Milk poached chicken bowl', uses: ['milk', 'chicken', 'avocado', 'egg'] });
    expect(query).toContain('poached');
    expect(query).toContain('avocado');
    expect(query).toContain('egg');
  });
  it('has stable identities for the same saved recipe', () => {
    expect(recipePhotoKey(recipe)).toBe(recipePhotoKey({ ...recipe, uses: ['pepper', 'butter', 'chicken'] }));
  });
  it('rejects generic chicken, raw ingredients, and the wrong dish', () => {
    expect(bestRecipePhoto(recipe, [hit('chicken, food'), hit('rotisserie chicken, pepper, butter, bbq')])).toBeUndefined();
  });
  it('selects a matching landscape dish and rejects portraits', () => {
    const match = hit('peppery butter chicken bites stir fry, pepper', 2);
    expect(bestRecipePhoto(recipe, [hit('food'), match])?.id).toBe(2);
    expect(bestRecipePhoto(recipe, [{ ...match, imageWidth: 800, imageHeight: 1200 }])).toBeUndefined();
  });
  it('chooses an emoji from the main ingredient', () => {
    expect(recipeEmoji(recipe)).toBe('🍗');
    expect(recipeEmoji({ title: 'Something new', uses: ['avocado', 'egg'] })).toBe('🥑');
  });
});