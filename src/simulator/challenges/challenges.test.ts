import { describe, expect, it } from 'vitest';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import {
  coil,
  contact,
  parallel,
  rung,
  series,
  type LadderProgram,
} from '@/simulator/languages/ladder/model';
import type { Project } from '@/simulator/project/types';
import { CHALLENGES, challengeProject, challengeRules, getChallenge, nextChallenge } from '.';
import { usedTypes, validate, type Validation } from './validator';

/** Reference solutions (kept out of the shipped content on purpose). */
const SOLUTIONS: Record<string, () => LadderProgram> = {
  'first-output': () => ({ rungs: [rung([contact('NO', 'I0.0')], [coil('coil', 'Q0.0')])] }),
  'run-and-stop-lights': () => ({
    rungs: [
      rung([contact('NC', 'MAQUINA')], [coil('coil', 'LUZ_DETENIDA')]),
      rung([contact('NO', 'MAQUINA')], [coil('coil', 'LUZ_MARCHA')]),
    ],
  }),
  'door-bell': () => ({
    rungs: [
      rung(
        [parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'I0.1')]))],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
  'two-hand-control': () => ({
    rungs: [rung([contact('NO', 'I0.0'), contact('NO', 'I0.1')], [coil('coil', 'Q0.0')])],
  }),
  'motor-seal-in': () => ({
    rungs: [
      rung(
        [
          parallel(series([contact('NO', 'MARCHA')]), series([contact('NO', 'K1_MOTOR')])),
          contact('NO', 'PARO'),
          contact('NO', 'TERMICO'),
        ],
        [coil('coil', 'K1_MOTOR')],
      ),
    ],
  }),
  'alarm-latch': () => ({
    rungs: [
      rung([contact('NO', 'I0.1')], [coil('reset', 'Q0.0')]),
      rung([contact('NO', 'I0.0')], [coil('set', 'Q0.0')]),
    ],
  }),
  'delayed-fan': () => ({
    rungs: [
      rung([contact('NO', 'I0.0'), contact('TON', 'T0', { pt: 'T#5s' })], [coil('coil', 'Q0.0')]),
      rung([contact('NO', 'I0.0'), contact('NC', 'Q0.0')], [coil('coil', 'Q0.1')]),
    ],
  }),
  'box-counter': () => ({
    rungs: [
      rung(
        [contact('NO', 'I0.0'), contact('CTU', 'C0', { pv: '5', r: 'I0.1' })],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
};

function grade(id: string, ladder: LadderProgram): Validation {
  const challenge = getChallenge(id)!;
  const project: Project = { ...challengeProject(challenge, 'es'), ladder };
  const { ir } = compileLadder(project.ladder, project.tags);
  return validate(ir, project.ladder, challengeRules(challenge));
}

describe('challenge content', () => {
  it('has the first 8 challenges in order, each with a reference solution', () => {
    expect(CHALLENGES).toHaveLength(8);
    expect(CHALLENGES.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const c of CHALLENGES) expect(SOLUTIONS[c.id], c.id).toBeDefined();
  });

  it('builds a starting project with tags, panel labels, plant and challenge id', () => {
    for (const c of CHALLENGES) {
      for (const locale of ['es', 'en'] as const) {
        const p = challengeProject(c, locale);
        expect(p.challenge).toBe(c.id);
        expect(p.plant).toBe(c.plant);
        expect(p.tags).toHaveLength(c.io.length);
        expect(p.ladder.rungs).toHaveLength(1);
        expect(c.hints[locale].length).toBeGreaterThan(0);
        expect(c.statement[locale].length).toBeGreaterThan(0);
      }
    }
  });

  it('every reference solution passes and respects the allowed instructions', () => {
    for (const c of CHALLENGES) {
      const result = grade(c.id, SOLUTIONS[c.id]!());
      expect(result, c.id).toEqual({
        status: 'passed',
        cases: c.tests.map(() => ({ passed: true })),
      });
    }
  });

  it('the empty starting program is never accepted', () => {
    for (const c of CHALLENGES) {
      expect(grade(c.id, challengeProject(c, 'es').ladder).status).toBe('invalid');
    }
  });

  it('nextChallenge follows the order', () => {
    expect(nextChallenge('first-output')?.id).toBe('run-and-stop-lights');
    expect(nextChallenge('box-counter')).toBeUndefined();
  });
});

describe('validator', () => {
  it('reports the first wrong output with time, expected and actual values', () => {
    // A plain start button without seal-in: the motor stops when START is released.
    const result = grade('motor-seal-in', {
      rungs: [rung([contact('NO', 'I0.0'), contact('NO', 'I0.1')], [coil('coil', 'Q0.0')])],
    });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.cases[0]).toEqual({
      passed: false,
      reason: 'output',
      at: 1000,
      address: 'Q0.0',
      expected: true,
      actual: false,
    });
  });

  it('uses the plant: an overload is seen through the plant sensor', () => {
    // Ignores the overload contact: fails only the overload case.
    const result = grade('motor-seal-in', {
      rungs: [
        rung(
          [
            parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'Q0.0')])),
            contact('NO', 'I0.1'),
          ],
          [coil('coil', 'Q0.0')],
        ),
      ],
    });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.cases.map((c) => c.passed)).toEqual([true, true, true, false]);
  });

  it('set priority matters: reset after set fails the "still active" case', () => {
    const result = grade('alarm-latch', {
      rungs: [
        rung([contact('NO', 'I0.0')], [coil('set', 'Q0.0')]),
        rung([contact('NO', 'I0.1')], [coil('reset', 'Q0.0')]),
      ],
    });
    expect(result.status === 'failed' && result.cases.map((c) => c.passed)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('rejects programs with errors, without outputs or with instructions not allowed', () => {
    expect(
      grade('first-output', { rungs: [rung([contact('NO', '')], [coil('coil', 'Q0.0')])] }),
    ).toEqual({ status: 'invalid', problem: 'errors' });
    expect(grade('first-output', { rungs: [rung([contact('NO', 'I0.0')], [])] })).toEqual({
      status: 'invalid',
      problem: 'empty',
    });
    expect(
      grade('first-output', { rungs: [rung([contact('NC', 'I0.0')], [coil('set', 'Q0.0')])] }),
    ).toEqual({ status: 'invalid', problem: 'notAllowed', types: ['NC', 'set'] });
  });

  it('usedTypes walks parallel branches and coils', () => {
    const types = usedTypes(SOLUTIONS['motor-seal-in']!());
    expect([...types].sort()).toEqual(['NO', 'coil']);
  });

  it('an expectation at t = 0 is checked after the first scan', () => {
    const c = getChallenge('first-output')!;
    const project = { ...challengeProject(c, 'es'), ladder: SOLUTIONS['first-output']!() };
    const { ir } = compileLadder(project.ladder, project.tags);
    const rules = {
      ...challengeRules(c),
      cases: [{ steps: [], expect: [{ at: 0, outputs: {} }] }],
    };
    expect(validate(ir, project.ladder, rules)).toEqual({
      status: 'passed',
      cases: [{ passed: true }],
    });
  });
});
