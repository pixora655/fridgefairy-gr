import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiRecipePhotoKey } from './recipe-photo';
const { stores, getStore } = vi.hoisted(() => {
  const stores = new Map<string, Map<string, unknown>>();
  const getStore = vi.fn(({ name }: { name: string }) => {
    let map = stores.get(name);
    if (!map) { map = new Map(); stores.set(name, map); }
    return {
      getWithMetadata: vi.fn(async (key: string) => map!.has(key) ? { data: map!.get(key), etag: JSON.stringify(map!.get(key)) } : null),
      setJSON: vi.fn(async (key: string, value: unknown, opts?: { onlyIfNew?: boolean; onlyIfMatch?: string }) => {
        if (opts?.onlyIfNew && map!.has(key)) return { modified: false };
        if (opts?.onlyIfMatch && opts.onlyIfMatch !== JSON.stringify(map!.get(key))) return { modified: false };
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
const accountId = 'b503ca0713822cd520a4a6317d2b7eae';
const output = { success: true, result: { image: jpeg } };
const request = vi.fn();
beforeEach(() => {
  stores.clear(); vi.clearAllMocks(); vi.stubGlobal('fetch', request);
  vi.stubEnv('AI_RECIPE_IMAGES_ENABLED', 'true');
  vi.stubEnv('CLOUDFLARE_AI_API_TOKEN', 'test-only-secret');
  vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '3');
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', accountId);
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
    vi.stubEnv('CLOUDFLARE_AI_API_TOKEN', '');
    expect(await findAIRecipePhoto(recipe)).toBeNull();
    vi.stubEnv('CLOUDFLARE_AI_API_TOKEN', 'test'); vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '0');
    expect(await findAIRecipePhoto(recipe)).toBeNull(); expect(request).not.toHaveBeenCalled();
  });
  it('includes complete preparation and missing ingredients in prompt and cache key', () => {
    expect(recipeImagePrompt(recipe)).toContain('cheese'); expect(recipeImagePrompt(recipe)).toContain('Cook and fold');
    expect(aiRecipePhotoKey(recipe)).not.toBe(aiRecipePhotoKey({ ...recipe, steps: ['Boil eggs'] }));
    expect(aiRecipePhotoKey(recipe)).not.toBe(aiRecipePhotoKey({ ...recipe, missing: [] }));
  });
  it('uses only the free-tier Cloudflare model and server token header', async () => {
    const photo = await generateRecipeImage(recipe, 'test-key', accountId);
    const [url, init] = request.mock.calls[0]!; const body = JSON.parse(init.body);
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/@cf/black-forest-labs/flux-1-schnell');
    expect(init.headers.Authorization).toBe('Bearer test-key'); expect(url).not.toContain('test-key');
    expect(body.steps).toBe(4); expect(body.prompt.length).toBeLessThanOrEqual(2048);
    expect(photo.generatedByAI).toBe(true); expect(photo.url).toMatch(/^data:image\/jpeg;base64,/);
  });
  it('supports PNG image output and rejects invalid account ids before fetch', async () => {
    const png = Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
    request.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { image: png } }), { status: 200 }));
    expect((await generateRecipeImage(recipe, 'test', accountId)).url).toMatch(/^data:image\/png;base64,/);
    await expect(generateRecipeImage(recipe, 'test', 'bad-id')).rejects.toThrow('Invalid image account');
    expect(request).toHaveBeenCalledTimes(1);
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
  it('keeps the global cap during concurrent different recipes', async () => {
    vi.stubEnv('AI_RECIPE_IMAGES_DAILY_LIMIT', '1');
    const images = await Promise.all([findAIRecipePhoto(recipe), findAIRecipePhoto({ ...recipe, title: 'Another meal' })]);
    expect(images.filter(Boolean)).toHaveLength(1); expect(request).toHaveBeenCalledTimes(1);
  });
  it('fails closed if persistent storage is unavailable', async () => {
    getStore.mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    expect(await findAIRecipePhoto(recipe)).toBeNull(); expect(request).not.toHaveBeenCalled();
  });
  it('does not retry failed provider requests or reveal details', async () => {
    request.mockResolvedValue(new Response('private provider error', { status: 429 }));
    expect(await findAIRecipePhoto(recipe)).toBeNull();
    expect(await findAIRecipePhoto(recipe)).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a completed response without image bytes', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: {} }), { status: 200 }));
    await expect(generateRecipeImage(recipe, 'test', accountId)).rejects.toThrow('Missing or invalid image output');
  });
});
