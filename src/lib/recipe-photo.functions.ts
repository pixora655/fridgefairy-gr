import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getRecipePhoto = createServerFn({ method: 'POST' })
  .inputValidator(input => z.object({ title: z.string().min(1).max(200), uses: z.array(z.string().max(100)).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { findRecipePhoto } = await import('./recipe-photo.server');
    return findRecipePhoto(data);
  });