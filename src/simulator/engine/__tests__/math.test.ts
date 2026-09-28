import { describe, expect, it } from 'vitest';
import {
  add,
  arith,
  assign,
  cmp,
  convert,
  div,
  int,
  mul,
  network,
  no,
  program,
  read,
  real,
  sub,
  time,
  TRUE,
} from '@/simulator/ir/builders';
import type { CompareOp, Expr } from '@/simulator/ir/types';
import { analyze } from '../analyze';
import { running } from './helpers';

/** Evaluates `value` into `target` in one scan and returns what was stored. */
function evaluate(target: string, value: Expr) {
  const rt = running(program(network('n', [assign(target, value)])));
  rt.scan();
  return rt.read(target);
}

describe('comparisons', () => {
  const cases: [CompareOp, number, number, boolean][] = [
    ['=', 3, 3, true],
    ['=', 3, 4, false],
    ['<>', 3, 4, true],
    ['<', 3, 4, true],
    ['<', 4, 4, false],
    ['>', 5, 4, true],
    ['<=', 4, 4, true],
    ['>=', 3, 4, false],
  ];
  it.each(cases)('%s %i %i → %s', (op, a, b, expected) => {
    expect(evaluate('Q0.0', cmp(op, int(a), int(b)))).toBe(expected);
  });

  it('compares a word with a constant', () => {
    const rt = running(
      program(
        network('n', [assign('MW0', int(7)), assign('Q0.0', cmp('>=', read('MW0'), int(5)))]),
      ),
    );
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('compares timer elapsed time with a TIME constant', () => {
    expect(evaluate('Q0.0', cmp('<', read('T0.ET'), time(1000)))).toBe(true);
  });
});

describe('INT arithmetic', () => {
  it('adds, subtracts, multiplies', () => {
    expect(evaluate('MW0', add(int(2), int(3)))).toBe(5);
    expect(evaluate('MW0', sub(int(2), int(3)))).toBe(-1);
    expect(evaluate('MW0', mul(int(-4), int(3)))).toBe(-12);
  });

  it('division truncates toward zero and dividing by zero gives 0', () => {
    expect(evaluate('MW0', div(int(7), int(2)))).toBe(3);
    expect(evaluate('MW0', div(int(-7), int(2)))).toBe(-3);
    expect(evaluate('MW0', div(int(7), int(0)))).toBe(0);
    expect(evaluate('MW0', arith('MOD', int(7), int(3)))).toBe(1);
  });

  it('wraps around like a 16-bit register', () => {
    expect(evaluate('MW0', add(int(32767), int(1)))).toBe(-32768);
    expect(evaluate('MW0', mul(int(300), int(300)))).toBe(90000 - 65536);
  });

  it('storing a REAL into an INT word truncates', () => {
    expect(evaluate('MW0', real(3.9))).toBe(3);
    expect(evaluate('MW0', real(-3.9))).toBe(-3);
  });
});

describe('REAL arithmetic', () => {
  it('uses floating point when any operand is REAL', () => {
    expect(evaluate('MD0', div(int(7), real(2)))).toBe(3.5);
    expect(evaluate('MD0', add(real(0.5), int(1)))).toBe(1.5);
  });

  it('stores with 32-bit precision', () => {
    expect(evaluate('MD0', real(0.1))).toBe(Math.fround(0.1));
  });

  it('INT_TO_REAL conversion avoids integer division', () => {
    expect(evaluate('MD0', div(convert('REAL', int(1)), int(4)))).toBe(0.25);
    expect(evaluate('MW0', convert('INT', real(40000)))).toBe(40000 - 65536);
  });
});

describe('MOVE and scaling', () => {
  it('moves between words and keeps values across scans', () => {
    const rt = running(
      program(
        network('a', [assign('MW1', add(read('MW1'), int(1)))]),
        network('b', [assign('MW2', read('MW1'))]),
      ),
    );
    rt.advance(50);
    expect(rt.read('MW1')).toBe(5);
    expect(rt.read('MW2')).toBe(5);
  });

  it('scales an analog input 0–27648 to 0–100 %', () => {
    // pct = IW0 * 100.0 / 27648
    const rt = running(
      program(network('n', [assign('MD0', div(mul(read('IW0'), real(100)), int(27648)))])),
    );
    rt.setAnalogInput('IW0', 13824);
    rt.scan();
    expect(rt.read('MD0')).toBe(50);
  });

  it('analog outputs reach the terminal at the end of the scan', () => {
    const rt = running(program(network('n', [assign('QW0', int(1234))])));
    rt.scan();
    expect(rt.getAnalogOutput('QW0')).toBe(1234);
    rt.stop();
    expect(rt.getAnalogOutput('QW0')).toBe(0);
  });
});

describe('type checking', () => {
  const codes = (value: Expr, target = 'Q0.0') =>
    analyze(program(network('n', [assign(target, value)]))).map((d) => d.code);

  it('rejects numbers where a BOOL is needed and vice versa', () => {
    expect(codes(int(1))).toEqual(['TYPE_MISMATCH']);
    expect(codes(no('I0.0'), 'MW0')).toEqual(['TYPE_MISMATCH']);
    expect(codes({ kind: 'and', args: [no('I0.0'), read('MW0')] })).toEqual(['TYPE_MISMATCH']);
    expect(codes(cmp('<', no('I0.0'), int(1)))).toEqual(['TYPE_MISMATCH']);
  });

  it('accepts mixed numeric types and BOOL equality', () => {
    expect(codes(add(int(1), real(2)), 'MD0')).toEqual([]);
    expect(codes(cmp('=', no('I0.0'), TRUE))).toEqual([]);
    expect(codes(cmp('>', read('T0.ET'), int(100)))).toEqual([]);
  });

  it('timer and counter members are read-only', () => {
    expect(codes(int(5), 'T0.ET')).toEqual(['READ_ONLY_TARGET']);
    expect(codes(TRUE, 'C0')).toEqual(['READ_ONLY_TARGET']);
  });

  it('invalid instances and duplicate calls', () => {
    const bad = analyze(
      program(
        network('n', [
          { kind: 'timer', type: 'TON', instance: 'C0', input: TRUE, preset: time(1) },
        ]),
      ),
    );
    expect(bad.map((d) => d.code)).toEqual(['INVALID_INSTANCE']);
    const dup = analyze(
      program(
        network('a', [
          { kind: 'timer', type: 'TON', instance: 'T1', input: TRUE, preset: time(1) },
        ]),
        network('b', [
          { kind: 'timer', type: 'TOF', instance: 'T1', input: TRUE, preset: time(1) },
        ]),
      ),
    );
    expect(dup.map((d) => `${d.severity}:${d.code}`)).toEqual([
      'warning:DUPLICATE_INSTANCE',
      'warning:DUPLICATE_INSTANCE',
    ]);
  });

  it('out-of-range words and instances are invalid addresses', () => {
    expect(codes(int(1), 'MW64')).toEqual(['INVALID_ADDRESS']);
    expect(codes(read('T99'))).toEqual(['INVALID_ADDRESS']);
  });
});
