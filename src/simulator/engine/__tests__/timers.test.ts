import { describe, expect, it } from 'vitest';
import { assign, network, no, program, read, time, tof, ton, tp } from '@/simulator/ir/builders';
import type { TimerStmt } from '@/simulator/ir/types';
import { running } from './helpers';

/**
 * Runs `scans` scans with I0.0 given by `input(scanIndex)`; returns Q0.0 (timer Q) and T0.ET
 * after each scan. Cycle time is 10 ms, so scan k starts at t = 10·k ms.
 */
function simulate(call: TimerStmt, input: (k: number) => boolean, scans: number) {
  const rt = running(program(network('n', [call, assign('Q0.0', read('T0'))])));
  const out: { q: boolean; et: number }[] = [];
  for (let k = 0; k < scans; k++) {
    rt.setInput('I0.0', input(k));
    rt.scan();
    out.push({ q: rt.getOutput('Q0.0'), et: rt.read('T0.ET') as number });
  }
  return out;
}

describe('TON (on-delay)', () => {
  const call = ton('T0', no('I0.0'), time(50));

  it('Q turns on once IN has been on for PT, and ET stops at PT', () => {
    const r = simulate(call, () => true, 8);
    expect(r.map((x) => x.et)).toEqual([0, 10, 20, 30, 40, 50, 50, 50]);
    expect(r.map((x) => x.q)).toEqual([false, false, false, false, false, true, true, true]);
  });

  it('IN off resets ET and Q immediately', () => {
    const r = simulate(call, (k) => k < 7, 9);
    expect(r[6]).toEqual({ q: true, et: 50 });
    expect(r[7]).toEqual({ q: false, et: 0 });
  });

  it('a pulse shorter than PT never turns Q on, and timing restarts from zero', () => {
    const r = simulate(call, (k) => k < 3 || k >= 4, 11);
    expect(r.slice(0, 3).every((x) => !x.q)).toBe(true);
    expect(r[3]?.et).toBe(0);
    expect(r[4]?.et).toBe(0); // restarted at scan 4
    expect(r[9]).toEqual({ q: true, et: 50 });
  });

  it('PT = 0 turns Q on in the same scan', () => {
    const r = simulate(ton('T0', no('I0.0'), time(0)), () => true, 1);
    expect(r[0]?.q).toBe(true);
  });

  it('exposes PT and IN as members', () => {
    const rt = running(program(network('n', [call])));
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.read('T0.PT')).toBe(50);
    expect(rt.read('T0.IN')).toBe(true);
  });
});

describe('TOF (off-delay)', () => {
  const call = tof('T0', no('I0.0'), time(30));

  it('Q follows IN on, and stays on for PT after IN falls', () => {
    const r = simulate(call, (k) => k >= 1 && k < 3, 9);
    expect(r.map((x) => x.q)).toEqual([false, true, true, true, true, true, false, false, false]);
    expect(r.map((x) => x.et)).toEqual([0, 0, 0, 0, 10, 20, 30, 30, 30]);
  });

  it('turning IN on again during the delay cancels it', () => {
    const r = simulate(call, (k) => k === 0 || k === 2, 8);
    expect(r[1]).toEqual({ q: true, et: 0 });
    expect(r[2]).toEqual({ q: true, et: 0 });
    expect(r.slice(3, 6).every((x) => x.q)).toBe(true);
    expect(r[6]?.q).toBe(false);
  });
});

describe('TP (pulse)', () => {
  const call = tp('T0', no('I0.0'), time(30));

  it('a rising edge produces a pulse of exactly PT, even if IN stays on', () => {
    const r = simulate(call, () => true, 6);
    expect(r.map((x) => x.q)).toEqual([true, true, true, false, false, false]);
    expect(r.map((x) => x.et)).toEqual([0, 10, 20, 30, 30, 30]);
  });

  it('the pulse lasts PT even if IN drops early', () => {
    const r = simulate(call, (k) => k === 0, 5);
    expect(r.map((x) => x.q)).toEqual([true, true, true, false, false]);
  });

  it('cannot be retriggered while running', () => {
    const r = simulate(call, (k) => k === 0 || k === 2, 5);
    expect(r.map((x) => x.q)).toEqual([true, true, true, false, false]);
  });

  it('ET resets when the pulse is over and IN is off; a new edge starts a new pulse', () => {
    const r = simulate(call, (k) => k < 5 || k === 7, 9);
    expect(r[5]?.et).toBe(0);
    expect(r[7]?.q).toBe(true);
  });
});

describe('timers and simulated time', () => {
  it('resolution is one cycle: a 25 ms preset completes after 30 ms at 10 ms cycles', () => {
    const r = simulate(ton('T0', no('I0.0'), time(25)), () => true, 4);
    expect(r.map((x) => x.q)).toEqual([false, false, false, true]);
  });

  it('the preset can come from a word (INT, in ms)', () => {
    const rt = running(
      program(
        network('n', [
          assign('MW0', { kind: 'const', value: 20, type: 'INT' }),
          ton('T0', no('I0.0'), read('MW0')),
        ]),
      ),
    );
    rt.setInput('I0.0', true);
    rt.advance(30);
    expect(rt.read('T0')).toBe(true);
  });

  it('timers are cleared by a restart', () => {
    const rt = running(program(network('n', [ton('T0', no('I0.0'), time(10))])));
    rt.setInput('I0.0', true);
    rt.advance(50);
    expect(rt.read('T0')).toBe(true);
    rt.stop();
    rt.start();
    expect(rt.read('T0')).toBe(false);
    expect(rt.read('T0.ET')).toBe(0);
  });
});
