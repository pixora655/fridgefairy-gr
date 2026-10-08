import { bestRecipePhoto, recipePhotoKey, recipePhotoQueries, type PhotoRecipe, type RecipePhoto, type PixabayHit } from './recipe-photo';

const pending = new Map<string, Promise<RecipePhoto | null>>();
type StoredPhoto = { path: string; sourceUrl: string; photographer: string };

export async function findRecipePhoto(recipe: PhotoRecipe): Promise<RecipePhoto | null> {
  if (process.env['AI_RECIPE_IMAGES_ENABLED'] === 'true') {
    const { findAIRecipePhoto } = await import('./recipe-image-ai.server');
    return findAIRecipePhoto(recipe);
  }
  const inputKey = recipePhotoKey(recipe);
  const existing = pending.get(inputKey);
  if (existing) return existing;
  const job = lookup(recipe).catch(() => null);
  pending.set(inputKey, job);
  try { return await job; } finally { pending.delete(inputKey); }
}

async function lookup(recipe: PhotoRecipe): Promise<RecipePhoto | null> {
  const apiKey = process.env['PIXABAY_API_KEY'];
  if (!apiKey) return null;
  // Only server-owned, non-personal stock-photo cache operations use the privileged client.
  // Callers cannot supply storage paths, image URLs, or database operations.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('v2' + recipePhotoKey(recipe)));
  const key = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  async function sign(photo: StoredPhoto): Promise<RecipePhoto | null> {
    const { data } = await supabaseAdmin.storage.from('recipe-photos').createSignedUrl(photo.path, 7 * 86400);
    return data ? { url: data.signedUrl, sourceUrl: photo.sourceUrl, photographer: photo.photographer } : null;
  }
  const { data: cached, error: readError } = await supabaseAdmin.from('recipe_photo_cache').select('photo,fetched_at').eq('recipe_key', key).maybeSingle();
  if (readError) return null;
  if (cached?.photo) return sign(cached.photo as StoredPhoto);
  if (cached && Date.now() - Date.parse(cached.fetched_at) < 86400000) return null;
  // Cache even misses for 24 hours, as required by Pixabay. No automated retries.
  const { error: cacheError } = await supabaseAdmin.from('recipe_photo_cache').upsert({ recipe_key: key, photo: null, fetched_at: new Date().toISOString() });
  if (cacheError) return null;
  let hit: PixabayHit | undefined;
  const queries = recipePhotoQueries(recipe);
  for (const [i, query] of queries.entries()) {
    const endpoint = new URL('https://pixabay.com/api/');
    endpoint.search = new URLSearchParams({ key: apiKey, q: query, category: 'food', orientation: 'horizontal', safesearch: 'true', image_type: 'photo', per_page: '30' }).toString();
    const response = await fetch(endpoint);
    if (!response.ok) { console.error('Pixabay search failed', response.status); continue; }
    const result = await response.json() as { hits?: PixabayHit[] };
    hit = bestRecipePhoto(recipe, result.hits ?? [], i < queries.length - 1);
    if (hit) break;
  }
  if (!hit) return null;
  const imageUrl = new URL(hit.webformatURL);
  if (imageUrl.protocol !== 'https:' || !['pixabay.com', 'cdn.pixabay.com'].includes(imageUrl.hostname)) return null;
  const image = await fetch(imageUrl);
  const contentType = image.headers.get('content-type') ?? '';
  if (!image.ok || !/^image\/(jpeg|png|webp)/.test(contentType)) return null;
  const bytes = await image.arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024) return null;
  const path = `${key}/${hit.id}`;
  const { error: uploadError } = await supabaseAdmin.storage.from('recipe-photos').upload(path, bytes, { contentType, upsert: true });
  if (uploadError) return null;
  const photo: StoredPhoto = { path, sourceUrl: hit.pageURL, photographer: hit.user };
  await supabaseAdmin.from('recipe_photo_cache').update({ photo }).eq('recipe_key', key);
  return sign(photo);
}