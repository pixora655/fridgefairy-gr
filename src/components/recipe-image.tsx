import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getRecipePhoto } from '@/lib/recipe-photo.functions';
import { recipeEmoji, recipePhotoKey, type PhotoRecipe, type RecipePhoto } from '@/lib/recipe-photo';

export function RecipeImage({ recipe, className, credit = true }: { recipe: PhotoRecipe; className: string; credit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const [failedUrl, setFailedUrl] = useState<string>();
  const fetchPhoto = useServerFn(getRecipePhoto);
  const key = recipePhotoKey(recipe);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { data, isPending } = useQuery({
    queryKey: ['recipe-photo', key], enabled: visible, retry: false, staleTime: Infinity, gcTime: Infinity,
    queryFn: async () => {
      const storageKey = `fc.photo.v1.${key}`;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const cached = JSON.parse(raw) as { photo: RecipePhoto | null; expires: number };
          if (cached.expires > Date.now()) return cached.photo;
        }
      } catch {}
      const photo = await fetchPhoto({ data: { title: recipe.title, uses: recipe.uses } });
      try { localStorage.setItem(storageKey, JSON.stringify({ photo, expires: Date.now() + (photo ? 6 : 1) * 86400000 })); } catch {}
      return photo;
    },
  });
  const url = data?.url;
  const fallback = !isPending && (!url || failedUrl === url);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {fallback ? (
        <div role="img" aria-label={`${recipe.title} — ${recipe.uses[0] ?? 'food'} illustration`} className="recipe-photo-fallback grid h-full w-full place-items-center">
          <span className="text-6xl" aria-hidden="true">{recipeEmoji(recipe)}</span>
        </div>
      ) : (
        <>
          {(!url || loadedUrl !== url) && <div role="status" aria-label={`Loading photo of ${recipe.title}`} className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />}
          {url && <img src={url} alt={recipe.title} loading="lazy" decoding="async" onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)} className={`h-full w-full object-cover ${loadedUrl === url ? 'opacity-100' : 'opacity-0'}`} />}
          {credit && data && loadedUrl === url && failedUrl !== url && <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} className="absolute bottom-2 right-2 max-w-[85%] truncate rounded-full bg-card/90 px-2 py-1 text-[10px] text-foreground">{data.photographer} · Pixabay</a>}
        </>
      )}
    </div>
  );
}