import { describe, expect, it } from 'vitest';
import {
  FALSE,
  TRUE,
  and,
  assign,
  nc,
  network,
  no,
  not,
  or,
  program,
  rising,
  xor,
} from '@/simulator/ir/builders';
import type { Expr } from '@/simulator/ir/types';
import { running, scanWith, truthTable } from './helpers';

const INPUTS = ['I0.0', 'I0.1', 'I0.2'] as const;

/** Evaluates `expr` into Q0.0 for every combination of the first `n` inputs. */
function check(n: number, expr: Expr, expected: (v: boolean[]) => boolean) {
  const rt = running(program(network('n', [assign('Q0.0', expr)])));
  for (const row of truthTable(n)) {
    const inputs = Object.fromEntries(row.map((v, i) => [INPUTS[i], v]));
    scanWith(rt, inputs);
    expect(rt.getOutput('Q0.0'), JSON.stringify(inputs)).toBe(expected(row));
  }
}

describe('contacts', () => {
  it('normally open contact follows the input', () => {
    check(1, no('I0.0'), ([a]) => a === true);
  });

  it('normally closed contact is the inverse of the input', () => {
    check(1, nc('I0.0'), ([a]) => a === false);
  });

  it('constants', () => {
    check(1, TRUE, () => true);
    check(1, FALSE, () => false);
  });
});

describe('logic operations', () => {
  it('AND (series contacts)', () => {
    check(2, and(no('I0.0'), no('I0.1')), ([a, b]) => !!a && !!b);
    check(3, and(no('I0.0'), no('I0.1'), no('I0.2')), (v) => v.every(Boolean));
  });

  it('OR (parallel contacts)', () => {
    check(2, or(no('I0.0'), no('I0.1')), ([a, b]) => !!a || !!b);
    check(3, or(no('I0.0'), no('I0.1'), no('I0.2')), (v) => v.some(Boolean));
  });

  it('XOR is true for an odd number of true operands', () => {
    check(2, xor(no('I0.0'), no('I0.1')), ([a, b]) => a !== b);
    check(3, xor(no('I0.0'), no('I0.1'), no('I0.2')), (v) => v.filter(Boolean).length % 2 === 1);
  });

  it('NOT', () => {
    check(2, not(and(no('I0.0'), no('I0.1'))), ([a, b]) => !(a && b));
  });

  it('series-parallel combination: (I0.0 OR I0.1) AND NOT I0.2', () => {
    check(3, and(or(no('I0.0'), no('I0.1')), nc('I0.2')), ([a, b, c]) => (!!a || !!b) && !c);
  });

  it('single-operand AND/OR behave like the operand', () => {
    check(1, and(no('I0.0')), ([a]) => !!a);
    check(1, or(no('I0.0')), ([a]) => !!a);
  });
});

describe('no short-circuit evaluation', () => {
  it('evaluates every AND operand, so an edge after an open contact stays up to date', () => {
    // Rung: I0.0 ──┤P I0.1├── Q0.0
    const rt = running(
      program(network('n', [assign('Q0.0', and(no('I0.0'), rising(no('I0.1'), 'p1')))])),
    );
    // I0.1 rises while I0.0 is off: no output, but the edge memory must record it.
    scanWith(rt, { 'I0.0': false, 'I0.1': true });
    expect(rt.getOutput('Q0.0')).toBe(false);
    // Now I0.0 closes while I0.1 is still on: there is no new edge, so no output.
    scanWith(rt, { 'I0.0': true });
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('evaluates every OR operand too', () => {
    const rt = running(
      program(network('n', [assign('Q0.0', or(no('I0.0'), rising(no('I0.1'), 'p1')))])),
    );
    scanWith(rt, { 'I0.0': true, 'I0.1': true }); // edge consumed even though I0.0 is already on
    scanWith(rt, { 'I0.0': false });
    expect(rt.getOutput('Q0.0')).toBe(false);
  });
});
