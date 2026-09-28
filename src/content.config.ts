import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Theory pages. Files live at src/content/learn/<locale>/<slug>.mdx, so entry ids look like
 * "es/what-is-a-plc". Order and grouping come from src/config/learn.ts, not from frontmatter.
 */
const learn = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Optional simulator example opened by the "Try it in the simulator" button. */
    example: z.string().optional(),
    /** Date the content was last reviewed (YYYY-MM-DD). */
    updated: z.coerce.date(),
  }),
});

export const collections = { learn };
