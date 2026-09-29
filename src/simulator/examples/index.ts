/**
 * Built-in examples (spec section 7), stored as bilingual JSON in src/content/examples/.
 *
 * Programs use direct addresses (I0.0, Q0.0…); the example's I/O list becomes the variable
 * table in the chosen language, so the editor shows MARCHA or START. The project is built
 * through the regular file parser, so examples get the same validation and fresh ids.
 */
import * as z from 'zod/mini';
import type { Locale } from '@/config/site';
import { FILE_FORMAT, FILE_VERSION, parseProjectFile } from '@/simulator/file/project-file';
import { PLANT_IDS, type PlantId } from '@/simulator/plants/types';
import type { InputMode, Project } from '@/simulator/project/types';

const localized = z.object({ es: z.string(), en: z.string() });

const exampleSchema = z.object({
  id: z.string().check(z.regex(/^[a-z0-9-]+$/)),
  order: z.number(),
  level: z.number().check(z.gte(1), z.lte(5)),
  plant: z.nullable(z.enum(PLANT_IDS)),
  title: localized,
  summary: localized,
  io: z.array(
    z.object({
      address: z.string(),
      name: localized,
      description: localized,
      mode: z.optional(z.enum(['switch', 'button-no', 'button-nc'])),
    }),
  ),
  steps: z.object({ es: z.array(z.string()), en: z.array(z.string()) }),
  rungs: z.array(
    z.object({
      comment: localized,
      logic: z.unknown(),
      coils: z.unknown(),
    }),
  ),
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

/** The example as a simulator project in one language (validated like a file). */
export function exampleProject(example: Example, locale: Locale): Project {
  const inputs: Record<string, { label: string; mode?: InputMode }> = {};
  const outputs: Record<string, { label: string }> = {};
  for (const signal of example.io) {
    if (signal.address.startsWith('I')) {
      inputs[signal.address] = {
        label: signal.name[locale],
        ...(signal.mode ? { mode: signal.mode } : {}),
      };
    } else if (signal.address.startsWith('Q')) {
      outputs[signal.address] = { label: signal.name[locale] };
    }
  }

  const file = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    project: {
      name: example.title[locale],
      language: 'LD',
      ladder: {
        rungs: example.rungs.map((r) => ({
          comment: r.comment[locale],
          logic: r.logic,
          coils: r.coils,
        })),
      },
      tags: example.io.map((s) => ({
        name: s.name[locale],
        address: s.address,
        comment: s.description[locale],
      })),
      io: { inputs, outputs },
      plant: example.plant,
    },
  };

  const result = parseProjectFile(JSON.stringify(file));
  if (!result.ok)
    throw new Error(
      `Example ${example.id} is not a valid project: ${JSON.stringify(result.error)}`,
    );
  return result.project;
}

export type { PlantId };
