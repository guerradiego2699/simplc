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
  'stair-light': () => ({
    rungs: [
      rung([contact('NO', 'I0.0'), contact('TOF', 'T0', { pt: 'T#10s' })], [coil('coil', 'Q0.0')]),
    ],
  }),
  'toggle-light': () => ({
    rungs: [
      rung([contact('P', 'I0.0')], [coil('coil', 'M0.0')]),
      rung(
        [
          parallel(
            series([contact('NO', 'M0.0'), contact('NC', 'Q0.0')]),
            series([contact('NC', 'M0.0'), contact('NO', 'Q0.0')]),
          ),
        ],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
  blinker: () => ({
    rungs: [
      rung(
        [contact('NO', 'I0.0'), contact('NC', 'T1'), contact('TON', 'T0', { pt: 'T#500ms' })],
        [],
      ),
      rung([contact('NO', 'T0'), contact('TON', 'T1', { pt: 'T#500ms' })], []),
      rung([contact('NO', 'I0.0'), contact('NC', 'T0')], [coil('coil', 'Q0.0')]),
    ],
  }),
  'people-counter': () => ({
    rungs: [
      rung(
        [contact('NO', 'I0.0'), contact('CTUD', 'C0', { pv: '3', cd: 'I0.1' })],
        [coil('coil', 'Q0.0')],
      ),
      rung([contact('EQ', 'C0.CV', { in2: '0' })], [coil('coil', 'Q0.1')]),
    ],
  }),
  'analog-alarm': () => ({
    rungs: [
      rung([contact('GT', 'IW0', { in2: '22118' })], [coil('coil', 'Q0.0')]),
      rung([contact('LT', 'IW0', { in2: '5530' })], [coil('coil', 'Q0.1')]),
    ],
  }),
  'reversing-interlock': () => ({
    rungs: [
      rung(
        [
          parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'Q0.0')])),
          contact('NO', 'I0.2'),
          contact('NO', 'I0.3'),
          contact('NC', 'Q0.1'),
        ],
        [coil('coil', 'Q0.0')],
      ),
      rung(
        [
          parallel(series([contact('NO', 'I0.1')]), series([contact('NO', 'Q0.1')])),
          contact('NO', 'I0.2'),
          contact('NO', 'I0.3'),
          contact('NC', 'Q0.0'),
        ],
        [coil('coil', 'Q0.1')],
      ),
    ],
  }),
  'tank-hysteresis': () => ({
    rungs: [
      rung(
        [
          contact('NO', 'I0.0'),
          parallel(series([contact('NC', 'I0.2')]), series([contact('NO', 'Q0.0')])),
          contact('NC', 'I0.3'),
        ],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
  'motor-cascade': () => ({
    rungs: [
      rung(
        [
          parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'Q0.0')])),
          contact('NO', 'I0.1'),
        ],
        [coil('coil', 'Q0.0')],
      ),
      rung([contact('NO', 'Q0.0'), contact('TON', 'T0', { pt: 'T#2s' })], [coil('coil', 'Q0.1')]),
      rung([contact('NO', 'Q0.1'), contact('TON', 'T1', { pt: 'T#2s' })], [coil('coil', 'Q0.2')]),
    ],
  }),
  'traffic-cycle': () => ({
    rungs: [
      rung([contact('NO', 'I0.0'), contact('NC', 'T0'), contact('TON', 'T0', { pt: 'T#8s' })], []),
      rung(
        [contact('NO', 'I0.0'), contact('LT', 'T0.ET', { in2: 'T#4s' })],
        [coil('coil', 'Q0.2')],
      ),
      rung(
        [
          contact('NO', 'I0.0'),
          contact('GE', 'T0.ET', { in2: 'T#4s' }),
          contact('LT', 'T0.ET', { in2: 'T#5s' }),
        ],
        [coil('coil', 'Q0.1')],
      ),
      rung(
        [contact('NO', 'I0.0'), contact('GE', 'T0.ET', { in2: 'T#5s' })],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
  'conveyor-batch': () => ({
    rungs: [
      rung(
        [contact('NO', 'I0.2'), contact('CTU', 'C0', { pv: '3', r: 'I0.1' })],
        [coil('coil', 'Q0.1')],
      ),
      rung(
        [
          parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'Q0.0')])),
          contact('NC', 'C0'),
        ],
        [coil('coil', 'Q0.0')],
      ),
    ],
  }),
  'analog-inverse-valve': () => ({
    rungs: [
      rung([contact('NO', 'I0.0')], [coil('SUB', 'QW0', { in1: '27648', in2: 'IW0' })]),
      rung([contact('NC', 'I0.0')], [coil('MOVE', 'QW0', { in: '0' })]),
    ],
  }),
  'gate-photocell': () => ({
    rungs: [
      rung(
        [
          parallel(
            series([contact('NO', 'I0.0')]),
            series([contact('NO', 'Q0.0')]),
            series([contact('NC', 'I0.4'), contact('NC', 'I0.3')]),
          ),
          contact('NC', 'I0.2'),
          contact('NC', 'Q0.1'),
        ],
        [coil('coil', 'Q0.0')],
      ),
      rung(
        [
          parallel(series([contact('NO', 'I0.1')]), series([contact('NO', 'Q0.1')])),
          contact('NC', 'I0.3'),
          contact('NO', 'I0.4'),
          contact('NC', 'Q0.0'),
        ],
        [coil('coil', 'Q0.1')],
      ),
      rung(
        [parallel(series([contact('NO', 'Q0.0')]), series([contact('NO', 'Q0.1')]))],
        [coil('coil', 'Q0.2')],
      ),
    ],
  }),
  'oven-thermostat': () => ({
    rungs: [
      rung([contact('NO', 'I0.0'), contact('LT', 'IW0', { in2: '8755' })], [coil('set', 'Q0.0')]),
      rung(
        [
          parallel(
            series([contact('GT', 'IW0', { in2: '9677' })]),
            series([contact('NC', 'I0.0')]),
          ),
        ],
        [coil('reset', 'Q0.0')],
      ),
    ],
  }),
  'pump-backup': () => ({
    rungs: [
      rung(
        [
          contact('NO', 'I0.0'),
          parallel(series([contact('NC', 'I0.2')]), series([contact('NO', 'M0.0')])),
          contact('NC', 'I0.3'),
        ],
        [coil('coil', 'M0.0')],
      ),
      rung([contact('NO', 'M0.0'), contact('NO', 'I0.4')], [coil('coil', 'Q0.0')]),
      rung(
        [contact('NO', 'M0.0'), contact('NC', 'I0.4'), contact('NO', 'I0.5')],
        [coil('coil', 'Q0.1')],
      ),
      rung([contact('NC', 'I0.4')], [coil('coil', 'Q0.2')]),
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
  it('has 22 challenges in order, each with a reference solution', () => {
    expect(CHALLENGES).toHaveLength(22);
    expect(CHALLENGES.map((c) => c.order)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
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

  it('typical mistakes are caught by the test cases', () => {
    const failed = (id: string, ladder: LadderProgram) => grade(id, ladder).status === 'failed';
    // TP instead of TOF: the light does not wait for the release.
    expect(
      failed('stair-light', {
        rungs: [
          rung(
            [contact('NO', 'I0.0'), contact('TP', 'T0', { pt: 'T#10s' })],
            [coil('coil', 'Q0.0')],
          ),
        ],
      }),
    ).toBe(true);
    // Toggle without an edge: a long press flickers.
    expect(
      failed('toggle-light', {
        rungs: [
          rung(
            [
              parallel(
                series([contact('NO', 'I0.0'), contact('NC', 'Q0.0')]),
                series([contact('NC', 'I0.0'), contact('NO', 'Q0.0')]),
              ),
            ],
            [coil('coil', 'Q0.0')],
          ),
        ],
      }),
    ).toBe(true);
    // No interlock: REVERSE closes the second contactor while running forward.
    expect(
      failed('reversing-interlock', {
        rungs: [
          rung(
            [
              parallel(series([contact('NO', 'I0.0')]), series([contact('NO', 'Q0.0')])),
              contact('NO', 'I0.2'),
              contact('NO', 'I0.3'),
            ],
            [coil('coil', 'Q0.0')],
          ),
          rung(
            [
              parallel(series([contact('NO', 'I0.1')]), series([contact('NO', 'Q0.1')])),
              contact('NO', 'I0.2'),
              contact('NO', 'I0.3'),
            ],
            [coil('coil', 'Q0.1')],
          ),
        ],
      }),
    ).toBe(true);
    // No hysteresis: the pump restarts as soon as the level drops below the high switch.
    expect(
      failed('tank-hysteresis', {
        rungs: [rung([contact('NO', 'I0.0'), contact('NC', 'I0.3')], [coil('coil', 'Q0.0')])],
      }),
    ).toBe(true);
    // A single 100 °C threshold instead of the 95–105 °C band.
    expect(
      failed('oven-thermostat', {
        rungs: [
          rung(
            [contact('NO', 'I0.0'), contact('LT', 'IW0', { in2: '9216' })],
            [coil('coil', 'Q0.0')],
          ),
        ],
      }),
    ).toBe(true);
  });

  it('nextChallenge follows the order', () => {
    expect(nextChallenge('first-output')?.id).toBe('run-and-stop-lights');
    expect(nextChallenge('box-counter')?.id).toBe('stair-light');
    expect(nextChallenge('pump-backup')).toBeUndefined();
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
