/**
 * IEC 61131-3 counters (16-bit INT range, like a real PLC).
 *
 *   CTU:  each rising edge of CU adds 1 (up to 32767). R resets CV to 0. Q = CV >= PV.
 *   CTD:  each rising edge of CD subtracts 1 (down to -32768). LD loads CV = PV. Q = CV <= 0.
 *   CTUD: both; QU = CV >= PV, QD = CV <= 0. R has priority over LD.
 */
import type { CounterState, CounterType } from '../memory';

export const COUNTER_MAX = 32767;
export const COUNTER_MIN = -32768;

export interface CounterInputs {
  up: boolean;
  down: boolean;
  reset: boolean;
  load: boolean;
  preset: number;
}

export function runCounter(c: CounterState, type: CounterType, i: CounterInputs): void {
  const upEdge = i.up && !c.cu;
  const downEdge = i.down && !c.cd;
  c.type = type;
  c.pv = Math.trunc(i.preset);

  if (i.reset && type !== 'CTD') {
    c.cv = 0;
  } else if (i.load && type !== 'CTU') {
    c.cv = c.pv;
  } else {
    if (upEdge && type !== 'CTD' && c.cv < COUNTER_MAX) c.cv++;
    if (downEdge && type !== 'CTU' && c.cv > COUNTER_MIN) c.cv--;
  }

  c.qu = c.cv >= c.pv;
  c.qd = c.cv <= 0;
  c.cu = i.up;
  c.cd = i.down;
}
