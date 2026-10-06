import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { tag } from '@/simulator/project/tags';
import { compileIl, ilProbe } from '../compile';

const TAGS = [
  tag('MARCHA', 'I0.0'),
  tag('PARO', 'I0.1'),
  tag('MOTOR', 'Q0.0'),
  tag('CUENTA', 'MW0'),
];

function run(source: string, tags = TAGS) {
  const result = compileIl(source, tags);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const rt = new PlcRuntime({ trace: true });
  rt.load(result.ir!);
  rt.start();
  return rt;
}

const codes = (source: string, tags = TAGS) =>
  compileIl(source, tags)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('IL: logic', () => {
  it('start/stop with seal-in (OR deferred with parentheses)', () => {
    const rt = run(`
      (* seal-in *)
      LD    MARCHA
      OR    MOTOR
      AND   PARO
      ST    MOTOR
    `);
    rt.setInput('I0.1', true);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.0', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.1', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('modifiers N, nested parentheses, STN, S and R, lower-case mnemonics', () => {
    const rt = run(`
      LD   I0.0
      AND( I0.1
      OR(  I0.2
      ANDN I0.3
      )
      )
      ST   Q0.1
      STN  Q0.2
      ld   i0.4
      s    Q0.3
      LDN  I0.5
      R    Q0.3
    `);
    const scan = (inputs: Record<string, boolean>) => {
      for (const a of ['I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5'])
        rt.setInput(a, inputs[a] ?? false);
      rt.scan();
    };
    scan({ 'I0.0': true, 'I0.2': true });
    expect(rt.getOutput('Q0.1')).toBe(true);
    expect(rt.getOutput('Q0.2')).toBe(false);
    scan({ 'I0.0': true, 'I0.2': true, 'I0.3': true });
    expect(rt.getOutput('Q0.1')).toBe(false);
    scan({ 'I0.4': true, 'I0.5': true });
    expect(rt.getOutput('Q0.3')).toBe(true);
    scan({ 'I0.5': true });
    expect(rt.getOutput('Q0.3')).toBe(true);
    scan({});
    expect(rt.getOutput('Q0.3')).toBe(false);
  });

  it('the accumulator keeps its value after ST even if the operand changes', () => {
    // M0.0 := NOT M0.0 (toggle) and M0.1 gets the OLD value of the expression.
    const rt = run(`
      LDN M0.0
      ST  M0.0
      ST  M0.1
    `);
    rt.scan();
    expect(rt.read('M0.0')).toBe(true);
    expect(rt.read('M0.1')).toBe(true);
    rt.scan();
    expect(rt.read('M0.0')).toBe(false);
    expect(rt.read('M0.1')).toBe(false);
  });

  it('records the current result of every line as a probe', () => {
    const rt = run(`LD I0.0\nANDN I0.1\nST Q0.0`);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.probes.get(ilProbe(1))).toBe(true);
    expect(rt.probes.get(ilProbe(2))).toBe(true);
    expect(rt.probes.get(ilProbe(3))).toBe(true);
  });
});

describe('IL: numbers, jumps and function blocks', () => {
  it('arithmetic, comparison and MOVE through the accumulator', () => {
    const rt = run(`
      LD   CUENTA
      ADD  1
      ST   CUENTA
      LD   CUENTA
      MUL( 2
      ADD  1
      )
      ST   MW2
      LD   CUENTA
      GE   3
      ST   Q0.0
      LD   2.5
      ST   MD0
    `);
    rt.scan();
    expect(rt.read('MW0')).toBe(1);
    expect(rt.read('MW2')).toBe(3);
    expect(rt.getOutput('Q0.0')).toBe(false);
    rt.scan();
    rt.scan();
    expect(rt.read('MW0')).toBe(3);
    expect(rt.read('MW2')).toBe(9);
    expect(rt.getOutput('Q0.0')).toBe(true);
    expect(rt.read('MD0')).toBe(2.5);
  });

  it('conditional forward jumps skip code; RETC ends the program', () => {
    const rt = run(`
      LD    I0.0
      JMPC  SALTO
      LD    TRUE
      ST    Q0.0
      JMP   FIN
SALTO:  LD    TRUE
      ST    Q0.1
FIN:  LD    I0.1
      RETC
      LD    TRUE
      ST    Q0.2
    `);
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1'), rt.getOutput('Q0.2')]).toEqual([
      true,
      false,
      true,
    ]);
    rt.setInput('I0.0', true);
    rt.setInput('I0.1', true);
    rt.scan();
    expect(rt.getOutput('Q0.1')).toBe(true);
    // Outputs are not written while skipped: Q0.0 and Q0.2 keep their last value.
    expect(rt.getOutput('Q0.0')).toBe(true);
    expect(rt.getOutput('Q0.2')).toBe(true);
  });

  it('CAL calls declared timers and counters', () => {
    const rt = run(`
      VAR
        T_ON : TON;
        CONT : CTU;
      END_VAR
      CAL  T_ON(IN := I0.0, PT := T#100ms)
      LD   T_ON.Q
      ST   Q0.0
      CAL  CONT(CU := I0.1, R := I0.2, PV := 2)
      LD   CONT.Q
      ST   Q0.1
    `);
    rt.setInput('I0.0', true);
    rt.advance(150);
    expect(rt.getOutput('Q0.0')).toBe(true);
    for (const v of [true, false, true, false]) {
      rt.setInput('I0.1', v);
      rt.scan();
    }
    expect(rt.getOutput('Q0.1')).toBe(true);
  });
});

describe('IL: diagnostics', () => {
  it('reports operator, operand, label and parenthesis errors', () => {
    expect(codes('FOO I0.0')).toEqual(['IL_UNKNOWN_OPERATOR']);
    expect(codes('LD')).toEqual(['IL_MISSING_OPERAND']);
    expect(codes('LD I0.0\nST 5')).toEqual(['IL_NOT_A_VARIABLE']);
    expect(codes('AND I0.0')).toEqual(['IL_NEEDS_LOAD']);
    expect(codes('LD I0.0\nJMPC NADA')).toEqual(['IL_UNKNOWN_LABEL']);
    expect(codes('A: LD I0.0\nJMPC A')).toEqual(['IL_BACKWARD_JUMP']);
    expect(codes('LD I0.0\nAND( I0.1\nST Q0.0')).toEqual(['IL_UNCLOSED_PAREN']);
    expect(codes('LD I0.0\n)')).toEqual(['IL_UNEXPECTED_PAREN']);
    expect(codes('LD I0.0\nJMPC A\nA: ST Q0.0')).toEqual(['IL_NEEDS_LOAD']);
    expect(codes('LD I0.0 I0.1')).toEqual(['IL_UNEXPECTED_OPERAND']);
    expect(codes('LD MW0\nAND I0.0\nST Q0.0')).toContain('TYPE_MISMATCH');
    expect(codes('LD I0.0\nST NADA')).toEqual(['ST_UNKNOWN_NAME']);
  });

  it('diagnostics point at the right line', () => {
    const [d] = compileIl('LD I0.0\n\nANDX I0.1', TAGS).diagnostics;
    expect(d?.range.start.line).toBe(3);
  });
});
