import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { tag } from '@/simulator/project/tags';
import { compileLadder, stateProbe } from '../compile';
import { coil, contact, rung, type LadderProgram } from '../model';

function run(program: LadderProgram, tags = [] as ReturnType<typeof tag>[]) {
  const { ir, diagnostics } = compileLadder(program, tags);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const rt = new PlcRuntime({ trace: true });
  rt.load(ir!);
  rt.start();
  return rt;
}

describe('timer boxes', () => {
  it('TON in a rung: the lamp turns on 1 s after the switch', () => {
    const timer = contact('TON', 'T0', { pt: 'T#1s' });
    const rt = run({ rungs: [rung([contact('NO', 'I0.0'), timer], [coil('coil', 'Q0.0')])] });
    rt.setInput('I0.0', true);
    rt.advance(990);
    expect(rt.getOutput('Q0.0')).toBe(false);
    rt.advance(20);
    expect(rt.getOutput('Q0.0')).toBe(true);
    expect(rt.probes.get(timer.id)).toBe(true); // power after the box = Q
    expect(rt.probes.get(stateProbe(timer.id))).toBe(true);
    rt.setInput('I0.0', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('TOF keeps the output on after the input drops; preset from a tag', () => {
    const rt = run(
      {
        rungs: [
          rung(
            [contact('NO', 'I0.0'), contact('TOF', 'Delay', { pt: 'T#200ms' })],
            [coil('coil', 'Q0.0')],
          ),
        ],
      },
      [tag('Delay', 'T3')],
    );
    rt.setInput('I0.0', true);
    rt.scan();
    rt.setInput('I0.0', false);
    rt.advance(150);
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.advance(100);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });
});

describe('counter boxes', () => {
  it('CTU counts presses; the reset bit clears it', () => {
    const counter = contact('CTU', 'C0', { pv: '3', r: 'I0.1' });
    const rt = run({ rungs: [rung([contact('NO', 'I0.0'), counter], [coil('coil', 'Q0.0')])] });
    for (let i = 0; i < 3; i++) {
      rt.setInput('I0.0', true);
      rt.scan();
      rt.setInput('I0.0', false);
      rt.scan();
    }
    expect(rt.read('C0.CV')).toBe(3);
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.1', true);
    rt.scan();
    expect(rt.read('C0.CV')).toBe(0);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('CTUD requires its count-down input', () => {
    const { diagnostics } = compileLadder(
      { rungs: [rung([contact('CTUD', 'C1', { pv: '5' })], [coil('coil', 'Q0.0')])] },
      [],
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MISSING_PARAM', params: { param: 'cd' } }),
    );
  });
});

describe('compare contacts', () => {
  it('GE compares a counter value with a constant', () => {
    const rt = run({
      rungs: [
        rung([contact('NO', 'I0.0'), contact('CTU', 'C0', { pv: '100' })], []),
        rung([contact('GE', 'C0.CV', { in2: '2' })], [coil('coil', 'Q0.0')]),
      ],
    });
    for (let i = 0; i < 2; i++) {
      rt.setInput('I0.0', true);
      rt.scan();
      rt.setInput('I0.0', false);
      rt.scan();
    }
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('compares timer elapsed time with a TIME literal', () => {
    const rt = run({
      rungs: [
        rung([contact('NO', 'I0.0'), contact('TON', 'T0', { pt: 'T#10s' })], []),
        rung([contact('GT', 'T0.ET', { in2: 'T#500ms' })], [coil('coil', 'Q0.1')]),
      ],
    });
    rt.setInput('I0.0', true);
    rt.advance(400);
    expect(rt.getOutput('Q0.1')).toBe(false);
    rt.advance(200);
    expect(rt.getOutput('Q0.1')).toBe(true);
  });
});

describe('output boxes', () => {
  it('MOVE and ADD run only while the rung conducts', () => {
    const rt = run({
      rungs: [
        rung(
          [contact('NO', 'I0.0')],
          [coil('MOVE', 'MW0', { in: '10' }), coil('ADD', 'MW1', { in1: 'MW0', in2: '5' })],
        ),
      ],
    });
    rt.scan();
    expect([rt.read('MW0'), rt.read('MW1')]).toEqual([0, 0]);
    rt.setInput('I0.0', true);
    rt.scan();
    expect([rt.read('MW0'), rt.read('MW1')]).toEqual([10, 15]);
  });

  it('a rising edge + ADD counts events into a word', () => {
    const rt = run({
      rungs: [rung([contact('P', 'I0.0')], [coil('ADD', 'MW2', { in1: 'MW2', in2: '1' })])],
    });
    for (let i = 0; i < 4; i++) {
      rt.setInput('I0.0', true);
      rt.scan();
      rt.scan();
      rt.setInput('I0.0', false);
      rt.scan();
    }
    expect(rt.read('MW2')).toBe(4);
  });

  it('SCALE converts a raw analog value to engineering units (REAL)', () => {
    const rt = run({
      rungs: [
        rung(
          [],
          [
            coil('SCALE', 'MD0', {
              in: 'IW0',
              inMin: '0',
              inMax: '27648',
              outMin: '0',
              outMax: '100',
            }),
          ],
        ),
      ],
    });
    rt.setAnalogInput('IW0', 6912);
    rt.scan();
    expect(rt.read('MD0')).toBe(25);
  });

  it('reports type errors on the element (a number into a coil, a bit into MOVE)', () => {
    const bad1 = coil('MOVE', 'Q0.0', { in: '5' });
    const bad2 = contact('EQ', 'I0.0', { in2: '1' });
    const { diagnostics } = compileLadder({ rungs: [rung([bad2], [bad1])] }, []);
    const codes = diagnostics.map((d) => `${d.code}@${d.elementId}`);
    expect(codes).toContain(`TYPE_MISMATCH@${bad1.id}`);
    expect(codes).toContain(`TYPE_MISMATCH@${bad2.id}`);
  });

  it('reports unknown symbols and missing parameters', () => {
    const el = coil('ADD', 'MW0', { in1: 'Nope' });
    const { diagnostics } = compileLadder({ rungs: [rung([], [el])] }, []);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_SYMBOL', params: { operand: 'Nope' } }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MISSING_PARAM', params: { param: 'in2' } }),
    );
  });
});
