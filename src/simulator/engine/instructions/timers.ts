/**
 * IEC 61131-3 timers on simulated time. Each call receives the current input, the preset and
 * the time at which the current scan started; resolution is therefore one scan cycle, exactly
 * like a real PLC evaluating its timers once per scan.
 *
 *   TON (on-delay):  Q goes TRUE once IN has been TRUE for PT. IN FALSE resets ET and Q.
 *   TOF (off-delay): Q is TRUE while IN is TRUE and stays TRUE for PT after IN falls.
 *   TP  (pulse):     a rising edge of IN starts a pulse of exactly PT; it cannot be retriggered
 *                    while running. ET resets when the pulse is over and IN is FALSE.
 */
import type { TimerState, TimerType } from '../memory';

export function runTimer(
  t: TimerState,
  type: TimerType,
  input: boolean,
  pt: number,
  now: number,
): void {
  const preset = Math.max(0, pt);
  const rising = input && !t.in;
  const falling = !input && t.in;
  t.type = type;
  t.pt = preset;

  switch (type) {
    case 'TON':
      if (!input) {
        t.running = false;
        t.et = 0;
        t.q = false;
      } else {
        if (rising) {
          t.running = true;
          t.start = now;
        }
        t.et = Math.min(now - t.start, preset);
        t.q = t.et >= preset;
      }
      break;

    case 'TOF':
      if (input) {
        t.running = false;
        t.et = 0;
        t.q = true;
      } else {
        if (falling) {
          t.running = true;
          t.start = now;
        }
        if (t.running) {
          t.et = Math.min(now - t.start, preset);
          t.q = t.et < preset;
          if (!t.q) t.running = false;
        } else {
          // Never started, or already expired: output stays off, ET holds.
          t.q = false;
        }
      }
      break;

    case 'TP':
      if (rising && !t.running && !t.q) {
        t.running = true;
        t.start = now;
      }
      if (t.running) {
        t.et = Math.min(now - t.start, preset);
        t.q = t.et < preset;
        if (!t.q) t.running = false;
      } else {
        t.q = false;
        if (!input) t.et = 0;
      }
      break;
  }

  t.in = input;
}
