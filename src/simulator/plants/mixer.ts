/**
 * Batch mixer (example 11): a tank filled with two ingredients, stirred for a while and emptied.
 * Pure TypeScript (no React, no DOM, no timers): simulated time only.
 *
 * Inputs read by the PLC: I0.2 level A reached (≥ 40 %), I0.3 tank full (≥ 80 %), I0.4 tank
 * empty (≤ 1 %). Outputs: Q0.0 valve A, Q0.1 valve B, Q0.2 mixer motor, Q0.3 drain valve,
 * Q0.4 "batch done" light.
 *
 * Each batch is graded when the tank empties: right if it had 40 ± 6 % of each ingredient and was
 * stirred (with liquid in the tank) for at least 8 s. Overfilling spills and is shown.
 */
import type { PlantModel } from './types';

export const MIXER = {
  fillPerS: 10,
  drainPerS: 16,
  levelA: 40,
  full: 80,
  emptyAt: 1,
  /** Minimum stirring time for a good batch. */
  mixMs: 8000,
  tolerance: 6,
  /** Stirring only mixes when the agitator is covered. */
  mixFrom: 10,
} as const;

export interface MixerState {
  /** Amount of each ingredient, in % of the tank. */
  a: number;
  b: number;
  /** Highest amounts reached in the current batch (graded when it empties). */
  peakA: number;
  peakB: number;
  mixedMs: number;
  ok: number;
  bad: number;
  /** Grade of the last batch. */
  last: 'ok' | 'bad' | null;
  spilled: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const mixerPlant: PlantModel<MixerState> = {
  id: 'mixer',
  sensors: ['I0.2', 'I0.3', 'I0.4'],
  actuators: ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'Q0.4'],
  initial: () => ({
    a: 0,
    b: 0,
    peakA: 0,
    peakB: 0,
    mixedMs: 0,
    ok: 0,
    bad: 0,
    last: null,
    spilled: false,
  }),
  step(s, dtMs, io) {
    const dt = dtMs / 1000;
    const before = s.a + s.b;
    let { a, b, mixedMs, spilled } = s;
    if (io.bit('Q0.0')) a += MIXER.fillPerS * dt;
    if (io.bit('Q0.1')) b += MIXER.fillPerS * dt;
    if (io.bit('Q0.2') && a + b >= MIXER.mixFrom) mixedMs += dtMs;
    let level = a + b;
    if (io.bit('Q0.3') && level > 0) {
      const out = Math.min(level, MIXER.drainPerS * dt);
      a -= (out * a) / level;
      b -= (out * b) / level;
      level = a + b;
    }
    if (level > 100) {
      // Overflow: the excess spills out.
      a = (a * 100) / level;
      b = (b * 100) / level;
      spilled = true;
    }
    a = clamp(a, 0, 100);
    b = clamp(b, 0, 100);
    const next: MixerState = {
      ...s,
      a,
      b,
      mixedMs,
      spilled,
      peakA: Math.max(s.peakA, a),
      peakB: Math.max(s.peakB, b),
    };
    // A batch ends when the tank empties: grade it and start counting the next one.
    const now = a + b;
    if (before > MIXER.emptyAt && now <= MIXER.emptyAt) {
      const good =
        Math.abs(next.peakA - MIXER.levelA) <= MIXER.tolerance &&
        Math.abs(next.peakB - (MIXER.full - MIXER.levelA)) <= MIXER.tolerance &&
        next.mixedMs >= MIXER.mixMs &&
        !next.spilled;
      return {
        ...next,
        a: 0,
        b: 0,
        peakA: 0,
        peakB: 0,
        mixedMs: 0,
        spilled: false,
        ok: s.ok + (good ? 1 : 0),
        bad: s.bad + (good ? 0 : 1),
        last: good ? 'ok' : 'bad',
      };
    }
    return next;
  },
  read: (s) => {
    const level = s.a + s.b;
    return {
      'I0.2': level >= MIXER.levelA,
      'I0.3': level >= MIXER.full,
      'I0.4': level <= MIXER.emptyAt,
    };
  },
};
