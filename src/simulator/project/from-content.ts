/**
 * Builds simulator projects from bilingual content files (examples, challenges).
 *
 * Content programs use direct addresses (I0.0, Q0.0…); the content's I/O list becomes the
 * variable table in the chosen language, so the editor shows MARCHA or START. The project goes
 * through the regular file parser, so content gets the same validation and fresh ids as files.
 */
import * as z from 'zod/mini';
import type { Locale } from '@/config/site';
import { FILE_FORMAT, FILE_VERSION, parseProjectFile } from '@/simulator/file/project-file';
import { PLANT_IDS } from '@/simulator/plants/types';
import type { InputMode, Project } from './types';

export const localizedSchema = z.object({ es: z.string(), en: z.string() });
export type Localized = z.infer<typeof localizedSchema>;

export const localizedListSchema = z.object({ es: z.array(z.string()), en: z.array(z.string()) });

export const plantIdSchema = z.nullable(z.enum(PLANT_IDS));

/** One signal of the content's I/O list. */
export const signalSchema = z.object({
  address: z.string(),
  name: localizedSchema,
  description: localizedSchema,
  mode: z.optional(z.enum(['switch', 'button-no', 'button-nc'])),
});
export type Signal = z.infer<typeof signalSchema>;

/** A rung as stored in content: same shape as in project files, comment per language. */
export const contentRungSchema = z.object({
  comment: localizedSchema,
  logic: z.unknown(),
  coils: z.unknown(),
});

export interface ContentProjectSource {
  name: string;
  io: readonly Signal[];
  rungs: readonly z.infer<typeof contentRungSchema>[];
  plant: Project['plant'];
  challenge?: string;
}

export function contentProject(source: ContentProjectSource, locale: Locale): Project {
  const inputs: Record<string, { label: string; mode?: InputMode }> = {};
  const outputs: Record<string, { label: string }> = {};
  for (const signal of source.io) {
    if (/^I\d/.test(signal.address)) {
      inputs[signal.address] = {
        label: signal.name[locale],
        ...(signal.mode ? { mode: signal.mode } : {}),
      };
    } else if (/^Q\d/.test(signal.address)) {
      outputs[signal.address] = { label: signal.name[locale] };
    }
  }

  const file = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    project: {
      name: source.name,
      language: 'LD',
      ladder: {
        rungs: source.rungs.map((r) => ({
          comment: r.comment[locale],
          logic: r.logic,
          coils: r.coils,
        })),
      },
      tags: source.io.map((s) => ({
        name: s.name[locale],
        address: s.address,
        comment: s.description[locale],
      })),
      io: { inputs, outputs },
      plant: source.plant,
      ...(source.challenge ? { challenge: source.challenge } : {}),
    },
  };

  const result = parseProjectFile(JSON.stringify(file));
  if (!result.ok) {
    throw new Error(
      `Content "${source.name}" is not a valid project: ${JSON.stringify(result.error)}`,
    );
  }
  return result.project;
}
