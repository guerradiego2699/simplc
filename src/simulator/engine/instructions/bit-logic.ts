/**
 * Bit logic: contacts (reads), NOT, AND, OR, XOR and edge detection.
 * Each factory receives already-compiled operands and returns a function evaluated every scan.
 */
import type { Memory } from '../memory';

export type BoolFn = () => boolean;

/** Reads one bit of a memory area (a normally-open contact; NC is NOT of this). */
export const readBit =
  (area: Uint8Array, index: number): BoolFn =>
  () =>
    area[index] === 1;

export const constant =
  (value: boolean): BoolFn =>
  () =>
    value;

export const notOp =
  (arg: BoolFn): BoolFn =>
  () =>
    !arg();

/** AND without short-circuit: every operand is evaluated (keeps edge detectors updated). */
export function andOp(args: BoolFn[]): BoolFn {
  return () => {
    let result = true;
    for (const arg of args) result = arg() && result;
    return result;
  };
}

/** OR without short-circuit. */
export function orOp(args: BoolFn[]): BoolFn {
  return () => {
    let result = false;
    for (const arg of args) result = arg() || result;
    return result;
  };
}

/** XOR: true when an odd number of operands are true. */
export function xorOp(args: BoolFn[]): BoolFn {
  return () => {
    let result = false;
    for (const arg of args) if (arg()) result = !result;
    return result;
  };
}

/**
 * Edge detector (IEC R_TRIG / F_TRIG, Ladder -|P|- / -|N|-).
 * The previous value starts FALSE after a restart, so a signal that is already TRUE on the first
 * scan produces a rising edge — the same behaviour as IEC R_TRIG.
 */
export function edgeOp(
  memory: Memory,
  instance: string,
  direction: 'rising' | 'falling',
  arg: BoolFn,
): BoolFn {
  return () => {
    const previous = memory.edges.get(instance) ?? false;
    const current = arg();
    memory.edges.set(instance, current);
    return direction === 'rising' ? current && !previous : !current && previous;
  };
}
