import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { fetchPhoto } = vi.hoisted(() => ({ fetchPhoto: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: () => fetchPhoto }));
vi.mock('@/lib/recipe-photo.functions', () => ({ getRecipePhoto: vi.fn() }));
import { RecipeImage } from './recipe-image';
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RecipeImage recipe={{ title: 'Egg omelette', uses: ['eggs'], steps: ['Fry eggs'] }} className="h-40" credit={false} /></QueryClientProvider>);
}
describe('RecipeImage', () => {
  it('labels AI images even when stock credit is disabled, and avoids localStorage image bytes', async () => {
    fetchPhoto.mockResolvedValue({ url: 'data:image/jpeg;base64,/9j/2Q==', sourceUrl: '', photographer: 'AI-generated', generatedByAI: true });
    show();
    const image = await screen.findByAltText('Egg omelette — AI-generated serving suggestion');
    fireEvent.load(image);
    await waitFor(() => expect(screen.getByText('AI image')).toBeInTheDocument());
    expect(screen.queryByText(/Pixabay/)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(fetchPhoto).toHaveBeenCalledWith({ data: expect.objectContaining({ steps: ['Fry eggs'] }) });
  });
  it('keeps recipe accessible with illustration if no image is available', async () => {
    fetchPhoto.mockResolvedValue(null); show();
    expect(await screen.findByRole('img', { name: 'Egg omelette — eggs illustration' })).toBeInTheDocument();
  });
});
