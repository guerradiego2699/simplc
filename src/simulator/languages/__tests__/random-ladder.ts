/** Test helpers: deterministic random Ladder programs (used by conversion equivalence tests). */
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

/** Deterministic pseudo-random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random program using contacts, edges, timers, counters, comparisons, parallels and boxes. */
export function randomProgram(random: () => number): LadderProgram {
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
