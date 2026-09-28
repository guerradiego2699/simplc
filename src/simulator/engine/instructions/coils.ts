/**
 * Coils: assignment (normal and negated coils), Set and Reset.
 * Negated coils are compiled as an assignment of NOT(value).
 */
import type { BoolFn } from './bit-logic';

export type Action = () => void;

/** target := value. Returns the written value through `onValue` (for power-flow probes). */
export function assignBit(
  area: Uint8Array,
  index: number,
  value: BoolFn,
  onValue?: (v: boolean) => void,
): Action {
  return () => {
    const v = value();
    area[index] = v ? 1 : 0;
    onValue?.(v);
  };
}

/** IF condition THEN target := TRUE — the bit stays set until something resets it. */
export function setBit(
  area: Uint8Array,
  index: number,
  condition: BoolFn,
  onValue?: (v: boolean) => void,
): Action {
  return () => {
    const c = condition();
    if (c) area[index] = 1;
    onValue?.(c);
  };
}

/** IF condition THEN target := FALSE. */
export function resetBit(
  area: Uint8Array,
  index: number,
  condition: BoolFn,
  onValue?: (v: boolean) => void,
): Action {
  return () => {
    const c = condition();
    if (c) area[index] = 0;
    onValue?.(c);
  };
}
