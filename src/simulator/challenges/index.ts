/**
 * Challenges with automatic grading (spec section 8), stored as bilingual JSON in
 * src/content/challenges/. Solutions are not shipped: only the statement, hints and test cases.
 */
import * as z from 'zod/mini';
import type { Locale } from '@/config/site';
import { LOGIC_TYPES, OUTPUT_TYPES } from '@/simulator/languages/ladder/catalog';
import { PLANTS } from '@/simulator/plants/models';
import {
  contentProject,
  localizedListSchema,
  localizedSchema,
  plantIdSchema,
  signalSchema,
} from '@/simulator/project/from-content';
import type { Project } from '@/simulator/project/types';
import type { ChallengeRules } from './validator';

const bitMap = z.record(z.string().check(z.regex(/^[IQ]\d+\.[0-7]$/)), z.boolean());

const testSchema = z.object({
  name: localizedSchema,
  steps: z.array(
    z.object({
      at: z.number().check(z.gte(0)),
      inputs: z.optional(bitMap),
      plant: z.optional(z.string()),
    }),
  ),
  expect: z
    .array(z.object({ at: z.number().check(z.gte(0)), outputs: bitMap }))
    .check(z.minLength(1)),
});

const challengeSchema = z.object({
  id: z.string().check(z.regex(/^[a-z0-9-]+$/)),
  order: z.number(),
  level: z.number().check(z.gte(1), z.lte(5)),
  plant: plantIdSchema,
  title: localizedSchema,
  statement: localizedListSchema,
  io: z.array(signalSchema),
  allowed: z.nullable(z.array(z.enum([...LOGIC_TYPES, ...OUTPUT_TYPES]))),
  hints: localizedListSchema,
  tests: z.array(testSchema).check(z.minLength(1)),
});

export type Challenge = z.infer<typeof challengeSchema>;

const modules = import.meta.glob('../../content/challenges/*.json', {
  eager: true,
  import: 'default',
});

/** All challenges, validated and sorted by order. Throws on invalid content. */
export const CHALLENGES: readonly Challenge[] = Object.entries(modules)
  .map(([path, data]) => {
    const result = z.safeParse(challengeSchema, data);
    if (!result.success) {
      throw new Error(`Invalid challenge ${path}: ${JSON.stringify(result.error.issues[0])}`);
    }
    return result.data;
  })
  .sort((a, b) => a.order - b.order);

export const getChallenge = (id: string | null | undefined): Challenge | undefined =>
  CHALLENGES.find((c) => c.id === id);

/** The next challenge in order, if any. */
export const nextChallenge = (id: string): Challenge | undefined => {
  const index = CHALLENGES.findIndex((c) => c.id === id);
  return index >= 0 ? CHALLENGES[index + 1] : undefined;
};

/** Starting project: variable table, labelled panel and plant, with an empty program. */
export const challengeProject = (challenge: Challenge, locale: Locale): Project =>
  contentProject(
    {
      name: challenge.title[locale],
      io: challenge.io,
      rungs: [],
      plant: challenge.plant,
      challenge: challenge.id,
    },
    locale,
  );

/** What the validator needs from a challenge. */
export const challengeRules = (challenge: Challenge): ChallengeRules => ({
  cases: challenge.tests,
  restInputs: challenge.io.filter((s) => s.mode === 'button-nc').map((s) => s.address),
  allowed: challenge.allowed,
  plant: challenge.plant ? PLANTS[challenge.plant] : null,
});
