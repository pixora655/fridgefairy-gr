CREATE TABLE public.recipe_photo_cache (
 recipe_key text PRIMARY KEY,
 photo jsonb,
 fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.recipe_photo_cache TO service_role;
ALTER TABLE public.recipe_photo_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipe photos are publicly viewable" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'recipe-photos');