import { describe, expect, it } from 'vitest';
import {
  and,
  assign,
  assignNot,
  let_,
  nc,
  network,
  no,
  or,
  program,
  read,
  reset,
  rs,
  set,
  sr,
  temp,
} from '@/simulator/ir/builders';
import { running, scanWith } from './helpers';

describe('coils', () => {
  it('a normal coil writes the rung result every scan', () => {
    const rt = running(program(network('n', [assign('Q0.0', no('I0.0'))])));
    expect(scanWith(rt, { 'I0.0': true }).getOutput('Q0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.0': false }).getOutput('Q0.0')).toBe(false);
  });

  it('a negated coil writes the inverse of the rung result', () => {
    const rt = running(program(network('n', [assignNot('Q0.0', no('I0.0'))])));
    expect(scanWith(rt, { 'I0.0': false }).getOutput('Q0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.0': true }).getOutput('Q0.0')).toBe(false);
  });

  it('coils can write markers that later networks read', () => {
    const rt = running(
      program(
        network('a', [assign('M0.0', no('I0.0'))]),
        network('b', [assign('Q0.0', read('M0.0'))]),
      ),
    );
    expect(scanWith(rt, { 'I0.0': true }).getOutput('Q0.0')).toBe(true);
    expect(rt.read('M0.0')).toBe(true);
  });
});

describe('set and reset', () => {
  const latch = program(
    network('set', [set('Q0.0', no('I0.0'))]),
    network('reset', [reset('Q0.0', no('I0.1'))]),
  );

  it('set latches the output until reset', () => {
    const rt = running(latch);
    scanWith(rt, { 'I0.0': true });
    expect(rt.getOutput('Q0.0')).toBe(true);
    scanWith(rt, { 'I0.0': false });
    expect(rt.getOutput('Q0.0')).toBe(true); // stays on
    scanWith(rt, { 'I0.1': true });
    expect(rt.getOutput('Q0.0')).toBe(false);
    scanWith(rt, { 'I0.1': false });
    expect(rt.getOutput('Q0.0')).toBe(false); // stays off
  });

  it('a false condition leaves the bit untouched', () => {
    const rt = running(latch);
    scanWith(rt);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('when both are active, the LAST instruction in the program wins (reset after set)', () => {
    const rt = running(latch);
    scanWith(rt, { 'I0.0': true, 'I0.1': true });
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('when both are active, the LAST instruction in the program wins (set after reset)', () => {
    const rt = running(
      program(
        network('reset', [reset('Q0.0', no('I0.1'))]),
        network('set', [set('Q0.0', no('I0.0'))]),
      ),
    );
    scanWith(rt, { 'I0.0': true, 'I0.1': true });
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('SR flip-flop is set-dominant', () => {
    const rt = running(program(network('n', [sr('Q0.0', no('I0.0'), no('I0.1'))])));
    expect(scanWith(rt, { 'I0.0': true, 'I0.1': true }).getOutput('Q0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.0': false, 'I0.1': false }).getOutput('Q0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.1': true }).getOutput('Q0.0')).toBe(false);
  });

  it('RS flip-flop is reset-dominant', () => {
    const rt = running(program(network('n', [rs('Q0.0', no('I0.0'), no('I0.1'))])));
    expect(scanWith(rt, { 'I0.0': true, 'I0.1': true }).getOutput('Q0.0')).toBe(false);
    expect(scanWith(rt, { 'I0.1': false }).getOutput('Q0.0')).toBe(true);
    expect(scanWith(rt, { 'I0.0': false }).getOutput('Q0.0')).toBe(true);
  });
});

describe('classic circuits', () => {
  it('start/stop with seal-in (stop button wired NC, examined with an NO contact)', () => {
    // Q0.0 := (START OR Q0.0) AND STOP_OK      START = I0.0 (NO), STOP = I0.1 (NC → 1 at rest)
    const rt = running(
      program(network('n', [assign('Q0.0', and(or(no('I0.0'), read('Q0.0')), no('I0.1')))])),
    );
    rt.setInput('I0.1', true); // NC stop button at rest

    scanWith(rt);
    expect(rt.getOutput('Q0.0')).toBe(false);
    scanWith(rt, { 'I0.0': true }); // press start
    expect(rt.getOutput('Q0.0')).toBe(true);
    scanWith(rt, { 'I0.0': false }); // release start: seal-in keeps it on
    expect(rt.getOutput('Q0.0')).toBe(true);
    scanWith(rt, { 'I0.1': false }); // press stop (or broken wire)
    expect(rt.getOutput('Q0.0')).toBe(false);
    scanWith(rt, { 'I0.1': true }); // release stop: stays off
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('interlocked forward/reverse: both directions can never be on together', () => {
    const fwd = and(or(no('I0.0'), read('Q0.0')), nc('I0.2'), nc('Q0.1'));
    const rev = and(or(no('I0.1'), read('Q0.1')), nc('I0.2'), nc('Q0.0'));
    const rt = running(
      program(network('f', [assign('Q0.0', fwd)]), network('r', [assign('Q0.1', rev)])),
    );

    scanWith(rt, { 'I0.0': true, 'I0.1': true }); // both pressed at once
    expect(rt.getOutput('Q0.0') && rt.getOutput('Q0.1')).toBe(false);
    expect(rt.getOutput('Q0.0')).toBe(true); // forward is evaluated first
    scanWith(rt, { 'I0.0': false });
    scanWith(rt);
    expect(rt.getOutput('Q0.1')).toBe(false); // reverse is locked out while forward runs
    scanWith(rt, { 'I0.1': false, 'I0.2': true }); // stop
    expect(rt.getOutput('Q0.0')).toBe(false);
    scanWith(rt, { 'I0.2': false, 'I0.1': true }); // now reverse can start
    expect(rt.getOutput('Q0.1')).toBe(true);
  });

  it('a rung with several parallel coils evaluates the logic once (temporaries)', () => {
    const rt = running(
      program(
        network('n', [
          let_('rung', and(no('I0.0'), nc('I0.1'))),
          assign('Q0.0', temp('rung')),
          assign('Q0.1', temp('rung')),
          set('M0.0', temp('rung')),
        ]),
      ),
    );
    scanWith(rt, { 'I0.0': true });
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1'), rt.read('M0.0')]).toEqual([
      true,
      true,
      true,
    ]);
  });
});
