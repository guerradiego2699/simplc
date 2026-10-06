import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { EXAMPLES, exampleProject } from '@/simulator/examples';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import {
  coil,
  contact,
  parallel,
  rung,
  series,
  type LadderProgram,
} from '@/simulator/languages/ladder/model';
import { tag } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import { compileIl } from '../compile';
import { ladderToIl } from '../from-ladder';
import { randomProgram, rng } from '../../__tests__/random-ladder';

const TEXTS = { header: 'Test', rung: 'Rung {n}', rungVariable: 'RUNG' };

const OBSERVED = [
  ...Array.from({ length: 16 }, (_, i) => `Q${Math.floor(i / 8)}.${i % 8}`),
  ...Array.from({ length: 8 }, (_, i) => `M0.${i}`),
  ...Array.from({ length: 6 }, (_, i) => `MW${i}`),
  ...Array.from({ length: 4 }, (_, i) => `T${i}.ET`),
  ...Array.from({ length: 3 }, (_, i) => `C${i}.CV`),
];

/** Runs the Ladder program and its IL conversion side by side with the same random inputs. */
function expectEquivalent(program: LadderProgram, tags: readonly Tag[], seed: number) {
  const ld = compileLadder(program, tags);
  expect(ld.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const source = ladderToIl(program, tags, TEXTS);
  const st = compileIl(source, tags);
  expect(
    st.diagnostics.filter((d) => d.severity === 'error'),
    source,
  ).toEqual([]);

  const a = new PlcRuntime();
  const b = new PlcRuntime();
  a.load(ld.ir!);
  b.load(st.ir!);
  a.start();
  b.start();
  const random = rng(seed);
  for (let scan = 0; scan < 300; scan++) {
    if (random() < 0.3) {
      const address = `I0.${Math.floor(random() * 8)}`;
      const v = random() < 0.5;
      a.setInput(address, v);
      b.setInput(address, v);
    }
    a.scan();
    b.scan();
    const left = OBSERVED.map((x) => a.read(x));
    const right = OBSERVED.map((x) => b.read(x));
    if (left.some((v, k) => v !== right[k])) {
      const k = left.findIndex((v, j) => v !== right[j]);
      expect(
        right[k],
        `${OBSERVED[k]} at scan ${scan}
${source}`,
      ).toBe(left[k]);
    }
  }
}

describe('Ladder → IL conversion', () => {
  it('produces readable IL with tag names, deferred OR, CAL and rung comments', () => {
    const program: LadderProgram = {
      rungs: [
        rung(
          [
            parallel(series([contact('NO', 'MARCHA')]), series([contact('NO', 'MOTOR')])),
            contact('NC', 'PARO'),
          ],
          [coil('coil', 'MOTOR')],
          'Seal-in',
        ),
        rung(
          [contact('NO', 'MOTOR'), contact('TON', 'T0', { pt: 'T#5s' })],
          [coil('coil', 'Q0.1'), coil('MOVE', 'MW0', { in: '5' })],
        ),
      ],
    };
    const tags = [tag('MARCHA', 'I0.0'), tag('PARO', 'I0.1'), tag('MOTOR', 'Q0.0')];
    expect(ladderToIl(program, tags, TEXTS)).toBe(
      [
        '(* Test *)',
        '',
        'VAR',
        '  T0 : TON;',
        'END_VAR',
        '',
        '(* Rung 1: Seal-in *)',
        '  LD    MARCHA',
        '  OR    MOTOR',
        '  ANDN  PARO',
        '  ST    MOTOR',
        '',
        '(* Rung 2 *)',
        '  CAL   T0(IN := MOTOR, PT := T#5s)',
        '  LD    T0.Q',
        '  ST    Q0.1',
        '  JMPCN SKIP_1',
        '  LD    5',
        '  ST    MW0',
        'SKIP_1:',
        '',
      ].join('\n'),
    );
  });

  it('every built-in example converts to equivalent ST', () => {
    for (const example of EXAMPLES) {
      const p = exampleProject(example, 'es');
      expectEquivalent(p.ladder, p.tags, example.order);
    }
  });

  it('300 random Ladder programs behave the same after conversion', { timeout: 60_000 }, () => {
    const random = rng(42);
    for (let k = 0; k < 300; k++) {
      expectEquivalent(randomProgram(random), [], k);
    }
  });
});
