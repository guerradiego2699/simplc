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
  type Coil,
  type LadderProgram,
  type LogicNode,
} from '@/simulator/languages/ladder/model';
import { tag } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import { compileSt } from '../compile';
import { ladderToSt } from '../from-ladder';

const TEXTS = { header: 'Test', rung: 'Rung {n}', rungVariable: 'RUNG' };

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OBSERVED = [
  ...Array.from({ length: 16 }, (_, i) => `Q${Math.floor(i / 8)}.${i % 8}`),
  ...Array.from({ length: 8 }, (_, i) => `M0.${i}`),
  ...Array.from({ length: 6 }, (_, i) => `MW${i}`),
  ...Array.from({ length: 4 }, (_, i) => `T${i}.ET`),
  ...Array.from({ length: 3 }, (_, i) => `C${i}.CV`),
];

/** Runs the Ladder program and its ST conversion side by side with the same random inputs. */
function expectEquivalent(program: LadderProgram, tags: readonly Tag[], seed: number) {
  const ld = compileLadder(program, tags);
  expect(ld.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const source = ladderToSt(program, tags, TEXTS);
  const st = compileSt(source, tags);
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

// ---------------------------------------------------------------------------------- random LD

function randomProgram(random: () => number): LadderProgram {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const bit = () =>
    pick(['I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5', 'M0.0', 'M0.1', 'Q0.0', 'Q0.1']);
  let timer = 0;
  let counter = 0;

  const element = (): LogicNode => {
    const r = random();
    if (r < 0.45) return contact(pick(['NO', 'NC'] as const), bit());
    if (r < 0.55) return contact(pick(['P', 'N'] as const), bit());
    if (r < 0.65 && timer < 4)
      return contact(pick(['TON', 'TOF', 'TP'] as const), `T${timer++}`, {
        pt: pick(['T#30ms', 'T#100ms', 'T#250ms']),
      });
    if (r < 0.72 && counter < 3) {
      const type = pick(['CTU', 'CTD', 'CTUD'] as const);
      return contact(type, `C${counter++}`, {
        pv: pick(['2', '3', '5']),
        ...(type !== 'CTD' && random() < 0.5 ? { r: bit() } : {}),
        ...(type !== 'CTU' && random() < 0.5 ? { ld: bit() } : {}),
        ...(type === 'CTUD' ? { cd: bit() } : {}),
      });
    }
    if (r < 0.8 && timer > 0)
      return contact(pick(['LT', 'GE', 'EQ'] as const), `T${Math.floor(random() * timer)}.ET`, {
        in2: pick(['T#50ms', 'T#100ms']),
      });
    if (r < 0.86)
      return contact(pick(['GT', 'NE', 'LE'] as const), 'MW0', { in2: pick(['2', '5']) });
    return parallel(
      series([element()]),
      series(random() < 0.3 ? [] : [element(), ...(random() < 0.4 ? [element()] : [])]),
    );
  };

  const coils = (): Coil[] => {
    const n = random() < 0.25 ? 2 : 1;
    return Array.from({ length: n }, () => {
      const r = random();
      if (r < 0.5)
        return coil(
          pick(['coil', 'negated', 'set', 'reset'] as const),
          pick(['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'M0.0', 'M0.1']),
        );
      if (r < 0.7) return coil('MOVE', pick(['MW1', 'MW2']), { in: pick(['MW0', '7', '-3']) });
      if (r < 0.9)
        return coil(pick(['ADD', 'SUB', 'MUL', 'DIV'] as const), 'MW0', {
          in1: 'MW0',
          in2: pick(['1', '2', 'MW1']),
        });
      return coil('SCALE', 'MW3', {
        in: 'MW0',
        inMin: '0',
        inMax: '27648',
        outMin: '0',
        outMax: '100',
      });
    });
  };

  return {
    rungs: Array.from({ length: 1 + Math.floor(random() * 5) }, () =>
      rung(Array.from({ length: Math.floor(random() * 4) }, element), coils()),
    ),
  };
}

describe('Ladder → ST conversion', () => {
  it('produces readable ST with tag names, VAR declarations and rung comments', () => {
    const program: LadderProgram = {
      rungs: [
        rung(
          [
            parallel(series([contact('NO', 'MARCHA')]), series([contact('NO', 'MOTOR')])),
            contact('NO', 'PARO'),
          ],
          [coil('coil', 'MOTOR')],
          'Seal-in',
        ),
        rung(
          [contact('NO', 'MOTOR'), contact('TON', 'T0', { pt: 'T#5s' })],
          [coil('coil', 'Q0.1')],
        ),
      ],
    };
    const tags = [tag('MARCHA', 'I0.0'), tag('PARO', 'I0.1'), tag('MOTOR', 'Q0.0')];
    expect(ladderToSt(program, tags, TEXTS)).toBe(
      [
        '(* Test *)',
        '',
        'VAR',
        '  T0 : TON;',
        'END_VAR',
        '',
        '(* Rung 1: Seal-in *)',
        'MOTOR := (MARCHA OR MOTOR) AND PARO;',
        '',
        '(* Rung 2 *)',
        'T0(IN := MOTOR, PT := T#5s);',
        'Q0.1 := T0.Q;',
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
