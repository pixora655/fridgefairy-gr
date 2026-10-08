import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getRecipePhoto = createServerFn({ method: 'POST' })
  .validator(input => z.object({ title: z.string().min(1).max(200), uses: z.array(z.string().max(100)).min(1).max(40), description: z.string().max(300).optional(), missing: z.array(z.string().max(100)).max(2).optional(), steps: z.array(z.string().max(700)).max(7).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { findRecipePhoto } = await import('./recipe-photo.server');
    return findRecipePhoto(data);
  });