import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiRecipePhotoKey } from './recipe-photo';
const { stores, getStore } = vi.hoisted(() => {
  const stores = new Map<string, Map<string, unknown>>();
  const getStore = vi.fn(({ name }: { name: string }) => {
    let map = stores.get(name);
    if (!map) { map = new Map(); stores.set(name, map); }
    return {
      getWithMetadata: vi.fn(async (key: string) => map!.has(key) ? { data: map!.get(key), etag: 'test' } : null),
      setJSON: vi.fn(async (key: string, value: unknown, opts?: { onlyIfNew?: boolean }) => {
        if (opts?.onlyIfNew && map!.has(key)) return { modified: false };
        map!.set(key, value); return { modified: true };
      }),
      delete: vi.fn(async (key: string) => { map!.delete(key); }),
    };
  });
  return { stores, getStore };
});
vi.mock('@netlify/blobs', () => ({ getStore }));
import { findAIRecipePhoto, generateRecipeImage, recipeImagePrompt } from './recipe-image-ai.server';
const recipe = { title: 'Spinach omelette', uses: ['eggs', 'spinach'], missing: ['cheese'], description: 'Folded omelette', steps: ['Beat eggs', 'Cook and fold with spinach and cheese'] };
const jpeg = Buffer.from([255, 216, 255, 217]).toString('base64');
const output = { status: 'completed', output_image: { type: 'image', mime_type: 'image/jpeg', data: jpeg } };
const request = vi.fn();
beforeEach(() => {
  stores.clear(); vi.clearAllMocks(); vi.stubGlobal('fetch', request);
  vi.stubEnv('AI_RECIPE_IMAGES_ENABLED', 'true');
  vi.stubEnv('GEMINI_IMAGE_API_KEY', 'test-only-secret');
  vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '3');
  request.mockResolvedValue(new Response(JSON.stringify(output), { status: 200 }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('AI recipe image preparation', () => {
  it('makes no storage or provider calls when feature is disabled', async () => {
    vi.stubEnv('AI_RECIPE_IMAGES_ENABLED', 'false');
    expect(await findAIRecipePhoto(recipe)).toBeNull();
    expect(getStore).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it('requires a separate image key and explicit positive daily limit', async () => {
    vi.stubEnv('GEMINI_IMAGE_API_KEY', '');
    expect(await findAIRecipePhoto(recipe)).toBeNull();
    vi.stubEnv('GEMINI_IMAGE_API_KEY', 'test'); vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '0');
    expect(await findAIRecipePhoto(recipe)).toBeNull(); expect(request).not.toHaveBeenCalled();
  });
  it('includes complete preparation and missing ingredients in prompt and cache key', () => {
    expect(recipeImagePrompt(recipe)).toContain('cheese'); expect(recipeImagePrompt(recipe)).toContain('Cook and fold');
    expect(aiRecipePhotoKey(recipe)).not.toBe(aiRecipePhotoKey({ ...recipe, steps: ['Boil eggs'] }));
    expect(aiRecipePhotoKey(recipe)).not.toBe(aiRecipePhotoKey({ ...recipe, missing: [] }));
  });
  it('uses the documented stateless image API, server key header and 1K horizontal format', async () => {
    const photo = await generateRecipeImage(recipe, 'test-key');
    const [url, init] = request.mock.calls[0]!; const body = JSON.parse(init.body);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(init.headers['x-goog-api-key']).toBe('test-key'); expect(url).not.toContain('test-key');
    expect(body.store).toBe(false); expect(body.model).toBe('gemini-3.1-flash-lite-image');
    expect(body.response_format).toEqual({ type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '1K' });
    expect(photo.generatedByAI).toBe(true); expect(photo.url).toMatch(/^data:image\/jpeg;base64,/);
  });
  it('supports model_output steps response', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [output.output_image] }] }), { status: 200 }));
    expect((await generateRecipeImage(recipe, 'test')).generatedByAI).toBe(true);
  });
  it('reuses persistent cached images without another provider call', async () => {
    const first = await findAIRecipePhoto(recipe);
    expect(first).not.toBeNull(); expect(await findAIRecipePhoto(recipe)).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('deduplicates concurrent requests for the same recipe', async () => {
    const [a, b] = await Promise.all([findAIRecipePhoto(recipe), findAIRecipePhoto(recipe)]);
    expect(a).toEqual(b); expect(request).toHaveBeenCalledTimes(1);
  });
  it('stops at a global daily limit and still serves cached images', async () => {
    vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '1');
    const first = await findAIRecipePhoto(recipe);
    expect(await findAIRecipePhoto({ ...recipe, title: 'Another omelette' })).toBeNull();
    expect(await findAIRecipePhoto(recipe)).toEqual(first); expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not retry failed provider requests or reveal details', async () => {
    request.mockResolvedValue(new Response('private provider error', { status: 429 }));
    expect(await findAIRecipePhoto(recipe)).toBeNull();
    expect(await findAIRecipePhoto(recipe)).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a completed response without image bytes', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));
    await expect(generateRecipeImage(recipe, 'test')).rejects.toThrow('Missing image output');
  });
});
