/**
 * Project file format (.plcampus.json) — spec 6.8.
 *
 * {
 *   "format": "plcampus-project",
 *   "version": 1,
 *   "savedAt": "2026-09-29T12:00:00.000Z",
 *   "project": { name, language, ladder, tags, io, plant }
 * }
 *
 * Files are validated with Zod (mini build: tiny bundle). On import every element, rung and tag
 * gets a fresh id, so hand-edited files with repeated ids cannot confuse the editor.
 */
import * as z from 'zod/mini';
import { LOGIC_TYPES, OUTPUT_TYPES } from '@/simulator/languages/ladder/catalog';
import {
  newId,
  type LadderProgram,
  type LogicNode,
  type Series,
} from '@/simulator/languages/ladder/model';
import type { Project } from '@/simulator/project/types';

export const FILE_FORMAT = 'plcampus-project';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.plcampus.json';

// ---------------------------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------------------------

const text = (max: number) => z.string().check(z.maxLength(max));
const params = z.optional(z.record(z.string(), text(64)));

const contactSchema = z.object({
  kind: z.literal('contact'),
  id: z.optional(z.string()),
  type: z.enum(LOGIC_TYPES),
  operand: text(64),
  params,
});

const coilSchema = z.object({
  kind: z.literal('coil'),
  id: z.optional(z.string()),
  type: z.enum(OUTPUT_TYPES),
  operand: text(64),
  params,
});

interface SeriesInput {
  id?: string | undefined;
  items: (z.infer<typeof contactSchema> | ParallelInput)[];
}
interface ParallelInput {
  kind: 'parallel';
  id?: string | undefined;
  branches: SeriesInput[];
}

const seriesSchema: z.ZodMiniType<SeriesInput> = z.object({
  id: z.optional(z.string()),
  items: z.array(z.union([contactSchema, z.lazy(() => parallelSchema)])),
});

const parallelSchema: z.ZodMiniType<ParallelInput> = z.object({
  kind: z.literal('parallel'),
  id: z.optional(z.string()),
  branches: z.array(seriesSchema).check(z.minLength(2)),
});

const rungSchema = z.object({
  id: z.optional(z.string()),
  comment: text(500),
  logic: seriesSchema,
  coils: z.array(coilSchema),
});

const tagSchema = z.object({
  id: z.optional(z.string()),
  name: text(64),
  address: text(32),
  comment: text(200),
});

const projectSchema = z.object({
  name: text(100),
  language: z.enum(['LD', 'ST', 'FBD', 'IL', 'SFC']),
  ladder: z.object({ rungs: z.array(rungSchema).check(z.maxLength(500)) }),
  tags: z.array(tagSchema).check(z.maxLength(1000)),
  io: z.object({
    inputs: z.record(
      z.string(),
      z.object({
        label: z.optional(text(40)),
        mode: z.optional(z.enum(['switch', 'button-no', 'button-nc'])),
      }),
    ),
    outputs: z.record(z.string(), z.object({ label: z.optional(text(40)) })),
  }),
  plant: z.nullable(z.string()),
  challenge: z.optional(z.string().check(z.maxLength(80))),
});

const fileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.number(),
  savedAt: z.optional(z.string()),
  project: projectSchema,
});

// ---------------------------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------------------------

export function serializeProject(project: Project, savedAt = new Date()): string {
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, savedAt: savedAt.toISOString(), project },
    null,
    2,
  );
}

/** Safe file name from the project name: "Partida y parada!" → "partida-y-parada.plcampus.json". */
export function fileNameFor(name: string, fallback: string): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || fallback;
  return `${base}${FILE_EXTENSION}`;
}

// ---------------------------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------------------------

export type ParseError =
  /** Not valid JSON at all. */
  | { code: 'INVALID_JSON' }
  /** Valid JSON, but not a project file of this site. */
  | { code: 'NOT_A_PROJECT' }
  /** Written by a newer version of the site. */
  | { code: 'NEWER_VERSION'; version: number }
  /** The structure does not match the schema; `path` points at the first problem. */
  | { code: 'INVALID_CONTENT'; path: string };

export type ParseResult = { ok: true; project: Project } | { ok: false; error: ParseError };

export function parseProjectFile(content: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { ok: false, error: { code: 'INVALID_JSON' } };
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    (data as { format?: unknown }).format !== FILE_FORMAT
  ) {
    return { ok: false, error: { code: 'NOT_A_PROJECT' } };
  }
  const version = (data as { version?: unknown }).version;
  if (typeof version === 'number' && version > FILE_VERSION) {
    return { ok: false, error: { code: 'NEWER_VERSION', version } };
  }

  const result = z.safeParse(fileSchema, data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: { code: 'INVALID_CONTENT', path: issue ? issue.path.join('.') : '' },
    };
  }
  return { ok: true, project: withFreshIds(result.data.project) };
}

/** Rebuilds the project giving every rung, series, element and tag a new unique id. */
function withFreshIds(p: z.infer<typeof projectSchema>): Project {
  const series = (s: SeriesInput): Series => ({
    id: newId('s'),
    items: s.items.map((item): LogicNode =>
      item.kind === 'parallel'
        ? { kind: 'parallel', id: newId('p'), branches: item.branches.map(series) }
        : {
            kind: 'contact',
            id: newId('c'),
            type: item.type,
            operand: item.operand,
            ...(item.params ? { params: item.params } : {}),
          },
    ),
  });

  const ladder: LadderProgram = {
    rungs: p.ladder.rungs.map((r) => ({
      id: newId('r'),
      comment: r.comment,
      logic: series(r.logic),
      coils: r.coils.map((c) => ({
        kind: 'coil' as const,
        id: newId('o'),
        type: c.type,
        operand: c.operand,
        ...(c.params ? { params: c.params } : {}),
      })),
    })),
  };
  if (ladder.rungs.length === 0)
    ladder.rungs.push({
      id: newId('r'),
      comment: '',
      logic: { id: newId('s'), items: [] },
      coils: [],
    });

  const inputs: Project['io']['inputs'] = {};
  for (const [address, setup] of Object.entries(p.io.inputs)) {
    inputs[address] = {
      ...(setup.label !== undefined ? { label: setup.label } : {}),
      ...(setup.mode !== undefined ? { mode: setup.mode } : {}),
    };
  }
  const outputs: Project['io']['outputs'] = {};
  for (const [address, setup] of Object.entries(p.io.outputs)) {
    outputs[address] = setup.label !== undefined ? { label: setup.label } : {};
  }

  return {
    name: p.name,
    language: p.language,
    ladder,
    tags: p.tags.map((t) => ({
      id: newId('t'),
      name: t.name,
      address: t.address,
      comment: t.comment,
    })),
    io: { inputs, outputs },
    plant: p.plant,
    ...(p.challenge !== undefined ? { challenge: p.challenge } : {}),
  };
}
