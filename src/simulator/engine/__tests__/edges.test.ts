import { describe, expect, it } from 'vitest';
import {
  and,
  assign,
  falling,
  if_,
  let_,
  network,
  no,
  not,
  program,
  read,
  rising,
  set,
  temp,
} from '@/simulator/ir/builders';
import { running, scanWith } from './helpers';

/** Runs one scan per value and returns Q0.0 after each. */
function trace(rt: ReturnType<typeof running>, input: string, values: boolean[]) {
  return values.map((v) => scanWith(rt, { [input]: v }).getOutput('Q0.0'));
}

describe('rising edge', () => {
  const p = program(network('n', [assign('Q0.0', rising(no('I0.0'), 'p'))]));

  it('is TRUE for exactly one scan when the signal goes FALSE → TRUE', () => {
    const rt = running(p);
    expect(trace(rt, 'I0.0', [false, true, true, true, false, false, true, true])).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('fires on the first scan if the signal is already TRUE (like IEC R_TRIG)', () => {
    const rt = running(p);
    expect(trace(rt, 'I0.0', [true, true])).toEqual([true, false]);
  });

  it('memory is cleared on restart, so it fires again after STOP → RUN', () => {
    const rt = running(p);
    trace(rt, 'I0.0', [true, true]);
    rt.stop();
    rt.start();
    expect(trace(rt, 'I0.0', [true])).toEqual([true]);
  });
});

describe('falling edge', () => {
  it('is TRUE for exactly one scan when the signal goes TRUE → FALSE', () => {
    const rt = running(program(network('n', [assign('Q0.0', falling(no('I0.0'), 'n'))])));
    expect(trace(rt, 'I0.0', [false, true, true, false, false, true, false])).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it('does not fire on the first scan when the signal starts FALSE', () => {
    const rt = running(program(network('n', [assign('Q0.0', falling(no('I0.0'), 'n'))])));
    expect(trace(rt, 'I0.0', [false])).toEqual([false]);
  });
});

describe('edge instances', () => {
  it('two detectors on the same signal have independent memory', () => {
    const rt = running(
      program(
        network('a', [assign('Q0.0', rising(no('I0.0'), 'first'))]),
        network('b', [assign('Q0.1', rising(no('I0.0'), 'second'))]),
      ),
    );
    scanWith(rt, { 'I0.0': true });
    expect([rt.getOutput('Q0.0'), rt.getOutput('Q0.1')]).toEqual([true, true]);
  });

  it('an edge can detect the rising edge of a whole expression (like P_TRIG)', () => {
    const rt = running(
      program(network('n', [assign('Q0.0', rising(and(no('I0.0'), no('I0.1')), 'rlo'))])),
    );
    scanWith(rt, { 'I0.0': true });
    expect(rt.getOutput('Q0.0')).toBe(false);
    scanWith(rt, { 'I0.1': true });
    expect(rt.getOutput('Q0.0')).toBe(true);
    scanWith(rt);
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('an edge that is not executed (inside a false IF) does not update its memory', () => {
    const rt = running(
      program(network('n', [if_(no('I0.1'), [assign('Q0.0', rising(no('I0.0'), 'p'))])])),
    );
    scanWith(rt, { 'I0.0': true, 'I0.1': false }); // edge not evaluated
    scanWith(rt, { 'I0.1': true }); // first evaluation: previous is still FALSE → fires
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('a pulse counter using set/reset toggles once per press (flip-flop)', () => {
    // Toggle Q0.0 on every rising edge of I0.0.
    const rt = running(
      program(
        network('n', [
          let_('pulse', rising(no('I0.0'), 't')),
          let_('wasOn', read('Q0.0')),
          set('Q0.0', and(temp('pulse'), not(temp('wasOn')))),
          { kind: 'reset', target: 'Q0.0', condition: and(temp('pulse'), temp('wasOn')) },
        ]),
      ),
    );
    const presses = [true, false, true, true, false, true, false];
    expect(trace(rt, 'I0.0', presses)).toEqual([true, true, false, false, false, true, true]);
  });
});
