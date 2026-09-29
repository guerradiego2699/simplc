import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { tag } from '@/simulator/project/tags';
import { motorStartStopProject } from '@/simulator/project/examples';
import { compileLadder, RAIL, stateProbe } from '../compile';
import { coil, contact, parallel, rung, series, type LadderProgram } from '../model';

const TEXTS = {
  name: 'Motor',
  start: 'START',
  stop: 'STOP',
  motor: 'MOTOR',
  startComment: '',
  stopComment: '',
  motorComment: '',
  rungComment: 'Motor',
};

function run(program: LadderProgram, tags = [] as ReturnType<typeof tag>[]) {
  const { ir, diagnostics } = compileLadder(program, tags);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const rt = new PlcRuntime({ trace: true });
  rt.load(ir!);
  rt.start();
  return rt;
}

describe('compileLadder', () => {
  it('compiles the motor start/stop example and it behaves like the real circuit', () => {
    const p = motorStartStopProject(TEXTS);
    const rt = run(p.ladder, p.tags);
    rt.setInput('I0.1', true); // NC stop button at rest
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(false);
    rt.setInput('I0.0', true);
    rt.scan();
    rt.setInput('I0.0', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true); // sealed in
    rt.setInput('I0.1', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('supports every contact and coil type', () => {
    const p: LadderProgram = {
      rungs: [
        rung([contact('NC', 'I0.0')], [coil('coil', 'Q0.0'), coil('negated', 'Q0.1')]),
        rung([contact('P', 'I0.1')], [coil('set', 'M0.0')]),
        rung([contact('N', 'I0.1')], [coil('reset', 'M0.0')]),
      ],
    };
    const rt = run(p);
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, false]);
    rt.setInput('I0.1', true);
    rt.scan();
    expect(rt.read('M0.0')).toBe(true); // set on rising edge
    rt.setInput('I0.1', false);
    rt.scan();
    expect(rt.read('M0.0')).toBe(false); // reset on falling edge
  });

  it('an edge feeding several branches and coils is evaluated once per scan', () => {
    const p = contact('P', 'I0.0');
    const program: LadderProgram = {
      rungs: [
        rung(
          [p, parallel(series([contact('NC', 'I0.1')]), series([contact('NO', 'I0.2')]))],
          [coil('coil', 'Q0.0'), coil('coil', 'Q0.1')],
        ),
      ],
    };
    const rt = run(program);
    rt.setInput('I0.0', true);
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, true]);
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([false, false]);
  });

  it('records power flow and contact state for every element', () => {
    const a = contact('NO', 'I0.0');
    const b = contact('NC', 'I0.1');
    const q = coil('coil', 'Q0.0');
    const rt = run({ rungs: [rung([a, b], [q])] });
    rt.setInput('I0.1', true);
    rt.scan();
    expect(rt.probes.get(stateProbe(a.id))).toBe(false);
    expect(rt.probes.get(a.id)).toBe(false);
    expect(rt.probes.get(stateProbe(b.id))).toBe(false);
    expect(rt.probes.get(q.id)).toBe(false);
    rt.setInput('I0.0', true);
    rt.setInput('I0.1', false);
    rt.scan();
    expect(rt.probes.get(a.id)).toBe(true);
    expect(rt.probes.get(b.id)).toBe(true);
    expect(rt.probes.get(q.id)).toBe(true);
    expect(RAIL).toBe('rail');
  });

  it('resolves tag names case-insensitively and direct IEC addresses', () => {
    const tags = [tag('Lamp', 'Q0.3')];
    const rt = run({ rungs: [rung([contact('NO', '%IX0.2')], [coil('coil', 'LAMP')])] }, tags);
    rt.setInput('I0.2', true);
    rt.scan();
    expect(rt.getOutput('Q0.3')).toBe(true);
  });

  it('reports missing operands and unknown symbols as errors on the element', () => {
    const a = contact('NO', '');
    const q = coil('coil', 'NOPE');
    const { ir, diagnostics } = compileLadder({ rungs: [rung([a], [q])] }, []);
    expect(ir).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'MISSING_OPERAND', elementId: a.id }),
        expect.objectContaining({ severity: 'error', code: 'UNKNOWN_SYMBOL', elementId: q.id }),
      ]),
    );
  });

  it('warns about open rungs, empty branches and duplicate coils', () => {
    const r1 = rung([contact('NO', 'I0.0')], []);
    const r2 = rung([parallel(series([contact('NO', 'I0.1')]), series())], [coil('coil', 'Q0.0')]);
    const r3 = rung([contact('NO', 'I0.2')], [coil('coil', 'Q0.0')]);
    const { ir, diagnostics } = compileLadder({ rungs: [r1, r2, r3] }, []);
    expect(ir).not.toBeNull(); // warnings only
    const codes = diagnostics.map((d) => `${d.code}@${d.rungId}`);
    expect(codes).toContain(`RUNG_WITHOUT_OUTPUT@${r1.id}`);
    expect(codes).toContain(`EMPTY_BRANCH@${r2.id}`);
    expect(codes).toContain(`DUPLICATE_OUTPUT@${r2.id}`);
    expect(codes).toContain(`DUPLICATE_OUTPUT@${r3.id}`);
  });

  it('reports engine errors (writing a system bit) on the coil', () => {
    const q = coil('coil', 'S0.0');
    const { diagnostics } = compileLadder({ rungs: [rung([contact('NO', 'I0.0')], [q])] }, []);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'READ_ONLY_TARGET', elementId: q.id }),
    );
  });

  it('a coil on an empty rung is always on (connected to the left rail)', () => {
    const rt = run({ rungs: [rung([], [coil('coil', 'Q0.0')])] });
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
  });
});
