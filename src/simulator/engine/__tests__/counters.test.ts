import { describe, expect, it } from 'vitest';
import { assign, counterCall, int, network, no, program, read } from '@/simulator/ir/builders';
import { running, scanWith } from './helpers';

const pulse = (rt: ReturnType<typeof running>, input: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    scanWith(rt, { [input]: true });
    scanWith(rt, { [input]: false });
  }
};

describe('CTU', () => {
  const p = program(
    network('n', [
      counterCall('CTU', 'C0', { up: no('I0.0'), reset: no('I0.1'), preset: int(3) }),
      assign('Q0.0', read('C0')),
    ]),
  );

  it('counts rising edges only and sets Q at CV >= PV', () => {
    const rt = running(p);
    scanWith(rt, { 'I0.0': true });
    scanWith(rt, { 'I0.0': true }); // held: no extra count
    expect(rt.read('C0.CV')).toBe(1);
    scanWith(rt, { 'I0.0': false }); // release before the next press
    pulse(rt, 'I0.0', 1);
    expect(rt.read('C0.CV')).toBe(2);
    expect(rt.getOutput('Q0.0')).toBe(false);
    pulse(rt, 'I0.0', 1);
    expect(rt.read('C0.CV')).toBe(3);
    expect(rt.getOutput('Q0.0')).toBe(true);
    pulse(rt, 'I0.0', 2);
    expect(rt.read('C0.CV')).toBe(5); // keeps counting past PV
    expect(rt.read('C0.PV')).toBe(3);
  });

  it('reset has priority and clears CV', () => {
    const rt = running(p);
    pulse(rt, 'I0.0', 3);
    scanWith(rt, { 'I0.0': true, 'I0.1': true });
    expect(rt.read('C0.CV')).toBe(0);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('stops at 32767 (no overflow)', () => {
    const rt = running(p);
    rt.memory.counters[0]!.cv = 32766;
    pulse(rt, 'I0.0', 3);
    expect(rt.read('C0.CV')).toBe(32767);
  });
});

describe('CTD', () => {
  const p = program(
    network('n', [
      counterCall('CTD', 'C1', { down: no('I0.0'), load: no('I0.2'), preset: int(2) }),
      assign('Q0.0', read('C1')),
    ]),
  );

  it('LD loads PV, each edge subtracts, Q at CV <= 0', () => {
    const rt = running(p);
    scanWith(rt, { 'I0.2': true });
    scanWith(rt, { 'I0.2': false });
    expect(rt.read('C1.CV')).toBe(2);
    expect(rt.getOutput('Q0.0')).toBe(false);
    pulse(rt, 'I0.0', 2);
    expect(rt.read('C1.CV')).toBe(0);
    expect(rt.getOutput('Q0.0')).toBe(true);
    pulse(rt, 'I0.0', 1);
    expect(rt.read('C1.CV')).toBe(-1);
  });
});

describe('CTUD', () => {
  const p = program(
    network('n', [
      counterCall('CTUD', 'C2', {
        up: no('I0.0'),
        down: no('I0.1'),
        reset: no('I0.2'),
        load: no('I0.3'),
        preset: int(2),
      }),
      assign('Q0.0', read('C2.QU')),
      assign('Q0.1', read('C2.QD')),
    ]),
  );

  it('counts up and down with QU / QD', () => {
    const rt = running(p);
    scanWith(rt);
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([false, true]);
    pulse(rt, 'I0.0', 2);
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, false]);
    pulse(rt, 'I0.1', 1);
    expect(rt.read('C2.CV')).toBe(1);
  });

  it('simultaneous up and down edges cancel out', () => {
    const rt = running(p);
    scanWith(rt, { 'I0.0': true, 'I0.1': true });
    expect(rt.read('C2.CV')).toBe(0);
  });

  it('reset wins over load', () => {
    const rt = running(p);
    scanWith(rt, { 'I0.2': true, 'I0.3': true });
    expect(rt.read('C2.CV')).toBe(0);
    scanWith(rt, { 'I0.2': false });
    expect(rt.read('C2.CV')).toBe(2);
  });
});
