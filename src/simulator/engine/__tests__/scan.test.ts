import { describe, expect, it } from 'vitest';
import {
  TRUE,
  and,
  assign,
  network,
  no,
  or,
  program,
  read,
  rising,
  set,
  while_,
} from '@/simulator/ir/builders';
import type { IrProgram } from '@/simulator/ir/types';
import { SYSTEM_BITS } from '../address';
import { PlcRuntime } from '../runtime';
import { running, scanWith } from './helpers';

const follow = program(network('n', [assign('Q0.0', no('I0.0'))]));

describe('process image', () => {
  it('inputs are frozen during the scan: a change mid-scan is seen only in the next scan', () => {
    const rt = running(
      program(
        network('first', [assign('M0.0', no('I0.0'))]),
        network('second', [assign('M0.1', no('I0.0'))]),
      ),
    );
    const steps = rt.scanSteps();
    expect(steps.next().value).toEqual({ phase: 'read' });
    expect(steps.next().value).toMatchObject({ phase: 'execute', networkId: 'first' });

    rt.setInput('I0.0', true); // the switch flips between the two networks

    expect(steps.next().value).toMatchObject({ phase: 'execute', networkId: 'second' });
    expect(rt.read('M0.0')).toBe(false);
    expect(rt.read('M0.1')).toBe(false); // same snapshot as the first network
    Array.from(steps); // finish the scan

    rt.scan();
    expect([rt.read('M0.0'), rt.read('M0.1')]).toEqual([true, true]);
  });

  it('outputs change at the terminals only in the "write outputs" phase', () => {
    const rt = running(follow);
    rt.setInput('I0.0', true);
    const steps = rt.scanSteps();
    steps.next(); // read
    steps.next(); // execute
    expect(rt.read('Q0.0')).toBe(true); // output image already written…
    expect(rt.getOutput('Q0.0')).toBe(false); // …but not the terminal
    expect(steps.next().value).toEqual({ phase: 'write' });
    expect(rt.getOutput('Q0.0')).toBe(true);
    expect(steps.next().value).toEqual({ phase: 'housekeeping' });
    expect(steps.next().done).toBe(true);
  });

  it('a program can read back an output written earlier in the same scan', () => {
    const rt = running(
      program(
        network('a', [assign('Q0.0', no('I0.0'))]),
        network('b', [assign('Q0.1', read('Q0.0'))]),
      ),
    );
    scanWith(rt, { 'I0.0': true });
    expect(rt.getOutput('Q0.1')).toBe(true); // same scan, no one-cycle delay
  });

  it('reading an output BEFORE it is written sees last scan’s value (one-cycle delay)', () => {
    const rt = running(
      program(
        network('a', [assign('Q0.1', read('Q0.0'))]),
        network('b', [assign('Q0.0', no('I0.0'))]),
      ),
    );
    scanWith(rt, { 'I0.0': true });
    expect(rt.getOutput('Q0.1')).toBe(false);
    scanWith(rt);
    expect(rt.getOutput('Q0.1')).toBe(true);
  });
});

describe('order of execution', () => {
  it('with duplicate coils, the last network decides the value', () => {
    const rt = running(
      program(
        network('a', [assign('Q0.0', no('I0.0'))]),
        network('b', [assign('Q0.0', no('I0.1'))]),
      ),
    );
    expect(scanWith(rt, { 'I0.0': true, 'I0.1': false }).getOutput('Q0.0')).toBe(false);
    expect(scanWith(rt, { 'I0.0': false, 'I0.1': true }).getOutput('Q0.0')).toBe(true);
  });

  it('scanSteps reports networks in program order with their index', () => {
    const rt = running(program(network('x', []), network('y', []), network('z', [])));
    const executed = [...rt.scanSteps()].filter((e) => e.phase === 'execute');
    expect(executed).toEqual([
      { phase: 'execute', networkId: 'x', index: 0 },
      { phase: 'execute', networkId: 'y', index: 1 },
      { phase: 'execute', networkId: 'z', index: 2 },
    ]);
  });
});

describe('simulated time', () => {
  it('each scan advances the clock by the cycle time (10 ms by default)', () => {
    const rt = running(follow);
    expect(rt.timeMs).toBe(0);
    rt.scan();
    rt.scan();
    expect(rt.timeMs).toBe(20);
    expect(rt.scanCount).toBe(2);
  });

  it('advance(ms) runs as many complete scans as fit', () => {
    const rt = running(follow, { cycleTimeMs: 5 });
    expect(rt.advance(23)).toBe(4);
    expect(rt.timeMs).toBe(20);
    expect(rt.scanCount).toBe(4);
  });

  it('rejects a non-positive cycle time', () => {
    expect(() => new PlcRuntime({ cycleTimeMs: 0 })).toThrow(RangeError);
  });
});

describe('system bits', () => {
  it('S0.0 is always on and S0.1 is on only in the first scan after start', () => {
    const rt = running(
      program(
        network('n', [
          assign('Q0.0', read(SYSTEM_BITS.alwaysOn)),
          assign('Q0.1', read(SYSTEM_BITS.firstScan)),
        ]),
      ),
    );
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, true]);
    rt.scan();
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, false]);
    rt.stop();
    rt.start();
    rt.scan();
    expect(rt.getOutput('Q0.1')).toBe(true);
  });

  it('S0.2 is a 1 Hz clock based on simulated time', () => {
    const rt = running(program(network('n', [assign('Q0.0', read(SYSTEM_BITS.clock1Hz))])), {
      cycleTimeMs: 100,
    });
    const values = Array.from({ length: 20 }, () => {
      rt.scan();
      return rt.getOutput('Q0.0');
    });
    // 5 scans on (0–400 ms), 5 off (500–900 ms), repeat.
    expect(values).toEqual([
      ...Array(5).fill(true),
      ...Array(5).fill(false),
      ...Array(5).fill(true),
      ...Array(5).fill(false),
    ]);
  });
});

describe('operating modes', () => {
  it('starts in STOP and does nothing until started', () => {
    const rt = new PlcRuntime();
    rt.load(follow);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.mode).toBe('STOP');
    expect(rt.getOutput('Q0.0')).toBe(false);
    expect(rt.scanCount).toBe(0);
    rt.start();
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('STOP turns every physical output off', () => {
    const rt = running(follow);
    scanWith(rt, { 'I0.0': true });
    rt.stop();
    expect(rt.mode).toBe('STOP');
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('warm restart keeps retentive markers and clears the others', () => {
    const p = program(network('n', [set('M0.0', no('I0.0')), set('M1.0', no('I0.0'))]));
    const rt = running(p, { layout: { retentiveMarkerBytes: 1 } });
    scanWith(rt, { 'I0.0': true });
    rt.stop();
    rt.start();
    expect(rt.read('M0.0')).toBe(true); // byte 0 is retentive
    expect(rt.read('M1.0')).toBe(false);
    rt.stop();
    rt.start({ cold: true });
    expect(rt.read('M0.0')).toBe(false);
  });

  it('reset() leaves a blank PLC: no program, memory, forces or time from before', () => {
    const rt = running(program(network('n', [set('M0.0', no('I0.0')), set('Q0.1', TRUE)])), {
      layout: { retentiveMarkerBytes: 1 },
    });
    rt.force('Q0.0', true);
    scanWith(rt, { 'I0.0': true });
    rt.reset();
    expect(rt.mode).toBe('STOP');
    expect(rt.loadedProgram).toBeNull();
    expect(rt.read('M0.0')).toBe(false); // even the retentive byte
    expect(rt.isForced('Q0.0')).toBe(false);
    expect(rt.getOutput('Q0.0')).toBe(false);
    expect(rt.timeMs).toBe(0);
    expect(rt.scanCount).toBe(0);
  });

  it('loading a new program in RUN keeps memory (online change)', () => {
    const rt = running(program(network('n', [set('M0.0', no('I0.0'))])));
    scanWith(rt, { 'I0.0': true });
    rt.load(program(network('n', [assign('Q0.0', read('M0.0'))])));
    expect(rt.mode).toBe('RUN');
    scanWith(rt);
    expect(rt.getOutput('Q0.0')).toBe(true);
  });
});

describe('monitor: modify and force', () => {
  it('write() changes a value once; the program may overwrite it', () => {
    const rt = running(follow);
    rt.write('M0.5', true);
    expect(rt.read('M0.5')).toBe(true);
    rt.write('Q0.0', true);
    scanWith(rt, { 'I0.0': false });
    expect(rt.read('Q0.0')).toBe(false);
    expect(() => rt.write('S0.0', true)).toThrow(RangeError);
  });

  it('a forced input is what the program reads, whatever the terminal says', () => {
    const rt = running(follow);
    rt.force('I0.0', true);
    expect(rt.isForced('I0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.0': false }).getOutput('Q0.0')).toBe(true);
    rt.force('I0.0', null);
    expect(scanWith(rt).getOutput('Q0.0')).toBe(false);
  });

  it('a forced output drives the terminal, even in STOP, while the image follows the program', () => {
    const rt = running(follow);
    rt.force('Q0.0', true);
    expect(rt.getOutput('Q0.0')).toBe(true); // applies immediately
    scanWith(rt, { 'I0.0': false });
    expect(rt.read('Q0.0')).toBe(false);
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.stop();
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.force('Q0.0', false);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('only inputs and outputs can be forced', () => {
    const rt = running(follow);
    expect(() => rt.force('M0.0', true)).toThrow(RangeError);
  });

  it('rejects invalid addresses and wrong areas in the I/O helpers', () => {
    const rt = running(follow);
    expect(() => rt.setInput('Q0.0', true)).toThrow(RangeError);
    expect(() => rt.getOutput('I0.0')).toThrow(RangeError);
    expect(() => rt.setInput('I7.0', true)).toThrow(RangeError);
    expect(() => rt.read('nope')).toThrow(RangeError);
  });
});

describe('watchdog', () => {
  const endless: IrProgram = program(
    network('ok', [assign('Q0.1', TRUE)]),
    network('loop', [while_(TRUE, [assign('M0.0', TRUE)])]),
  );

  it('an endless loop trips the watchdog: STOP, outputs off, fault recorded', () => {
    const rt = running(endless, { maxStepsPerScan: 1000 });
    rt.scan();
    expect(rt.mode).toBe('STOP');
    expect(rt.fault).toEqual({ code: 'WATCHDOG', networkId: 'loop', timeMs: 0 });
    expect(rt.getOutput('Q0.1')).toBe(false);
  });

  it('the fault is cleared by the next start', () => {
    const rt = running(endless, { maxStepsPerScan: 1000 });
    rt.scan();
    rt.load(follow);
    rt.start();
    expect(rt.fault).toBeNull();
    expect(rt.mode).toBe('RUN');
  });

  it('a bounded loop within budget runs normally', () => {
    // WHILE NOT M0.0 DO M0.0 := TRUE — one iteration.
    const rt = running(
      program(network('n', [while_({ kind: 'not', arg: read('M0.0') }, [assign('M0.0', TRUE)])])),
    );
    rt.scan();
    expect(rt.mode).toBe('RUN');
    expect(rt.read('M0.0')).toBe(true);
  });
});

describe('power-flow probes', () => {
  it('records the value of probed nodes when tracing is on', () => {
    const rt = running(
      program(
        network('n', [
          {
            kind: 'assign',
            target: 'Q0.0',
            probe: 'coil',
            value: {
              kind: 'and',
              probe: 'series',
              args: [
                { kind: 'read', address: 'I0.0', probe: 'c1' },
                { kind: 'read', address: 'I0.1', probe: 'c2' },
              ],
            },
          },
        ]),
      ),
      { trace: true },
    );
    scanWith(rt, { 'I0.0': true, 'I0.1': false });
    expect(Object.fromEntries(rt.probes)).toEqual({
      c1: true,
      c2: false,
      series: false,
      coil: false,
    });
  });

  it('records nothing when tracing is off', () => {
    const rt = running(
      program(network('n', [assign('Q0.0', { kind: 'read', address: 'I0.0', probe: 'c' })])),
    );
    scanWith(rt, { 'I0.0': true });
    expect(rt.probes.size).toBe(0);
  });
});

describe('snapshot', () => {
  it('returns a detached copy of the whole state', () => {
    const rt = running(follow);
    rt.force('I0.1', true);
    scanWith(rt, { 'I0.0': true });
    const snap = rt.snapshot();
    expect(snap.mode).toBe('RUN');
    expect(snap.scanCount).toBe(1);
    expect(snap.bits.I.slice(0, 2)).toEqual([true, true]);
    expect(snap.physicalInputs.slice(0, 2)).toEqual([true, false]);
    expect(snap.physicalOutputs[0]).toBe(true);
    expect(snap.forced).toEqual({ 'I0.1': true });

    snap.bits.Q[0] = false; // mutating the snapshot must not affect the PLC
    expect(rt.read('Q0.0')).toBe(true);
  });
});

describe('performance', () => {
  it('runs 10 000 scans of a 100-rung program quickly', () => {
    const rungs = Array.from({ length: 100 }, (_, i) =>
      network(`r${i}`, [
        assign(
          `M${Math.floor(i / 8)}.${i % 8}`,
          and(
            or(no('I0.0'), read(`M${Math.floor(i / 8)}.${i % 8}`)),
            no('I0.1'),
            rising(no('I0.2'), `e${i}`),
          ),
        ),
      ]),
    );
    const rt = running(program(...rungs));
    const start = performance.now();
    rt.advance(10_000 * rt.cycleTimeMs);
    const elapsed = performance.now() - start;
    expect(rt.scanCount).toBe(10_000);
    expect(elapsed).toBeLessThan(3000); // generous: it takes well under a second on a laptop
  });
});
