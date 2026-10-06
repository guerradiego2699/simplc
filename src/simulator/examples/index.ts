/**
 * Built-in examples (spec section 7), stored as bilingual JSON in src/content/examples/.
 */
import * as z from 'zod/mini';
import type { Locale } from '@/config/site';
import {
  contentProject,
  contentRungSchema,
  contentSfcSchema,
  localizedListSchema,
  localizedSchema,
  plantIdSchema,
  signalSchema,
} from '@/simulator/project/from-content';
import type { Project } from '@/simulator/project/types';

const exampleSchema = z.object({
  id: z.string().check(z.regex(/^[a-z0-9-]+$/)),
  order: z.number(),
  level: z.number().check(z.gte(1), z.lte(5)),
  plant: plantIdSchema,
  title: localizedSchema,
  summary: localizedSchema,
  io: z.array(signalSchema),
  steps: localizedListSchema,
  rungs: z.array(contentRungSchema),
  /** Examples written in SFC (the Ladder program is then empty). */
  sfc: z.optional(contentSfcSchema),
});

export type Example = z.infer<typeof exampleSchema>;

const modules = import.meta.glob('../../content/examples/*.json', {
  eager: true,
  import: 'default',
});

/** All examples, validated and sorted by their order in the spec. Throws on invalid content. */
export const EXAMPLES: readonly Example[] = Object.entries(modules)
  .map(([path, data]) => {
    const result = z.safeParse(exampleSchema, data);
    if (!result.success) {
      throw new Error(`Invalid example ${path}: ${JSON.stringify(result.error.issues[0])}`);
    }
    return result.data;
  })
  .sort((a, b) => a.order - b.order);

export const getExample = (id: string | null | undefined): Example | undefined =>
  EXAMPLES.find((e) => e.id === id);

/** The example as a simulator project in one language. */
export const exampleProject = (example: Example, locale: Locale): Project =>
  contentProject(
    {
      name: example.title[locale],
      io: example.io,
      rungs: example.rungs,
      plant: example.plant,
      sfc: example.sfc,
    },
    locale,
  );
