/**
 * Bit addresses in the engine's canonical generic notation: <area><byte>.<bit>
 *
 *   I0.0 … digital inputs        Q0.0 … digital outputs
 *   M0.0 … internal marker bits  S0.0 … system bits (read-only)
 *
 * The parser also accepts IEC 61131-3 direct representation (%IX0.0, %I0.0, %QX1.7, %MX10.3).
 * Brand-specific display styles (Siemens, Allen-Bradley, …) are a UI concern (Phase 5): memory
 * is always addressed in this canonical form.
 */

export const BIT_AREAS = ['I', 'Q', 'M', 'S'] as const;
export type BitArea = (typeof BIT_AREAS)[number];

export interface BitRef {
  area: BitArea;
  byte: number;
  bit: number;
}

const BIT_ADDRESS = /^%?([IQMS])X?(\d{1,4})\.([0-7])$/;

/** Parses a bit address; returns null when the text is not a valid bit address. */
export function parseBitAddress(text: string): BitRef | null {
  const match = BIT_ADDRESS.exec(text.trim().toUpperCase());
  if (!match) return null;
  const [, area, byte, bit] = match;
  return { area: area as BitArea, byte: Number(byte), bit: Number(bit) };
}

export function formatBitAddress(ref: BitRef): string {
  return `${ref.area}${ref.byte}.${ref.bit}`;
}

/** Normalizes any accepted spelling ("%ix0.0", " i0.0 ") to canonical form ("I0.0"). */
export function normalizeBitAddress(text: string): string | null {
  const ref = parseBitAddress(text);
  return ref ? formatBitAddress(ref) : null;
}

/** Linear bit index inside its area. */
export function bitIndex(ref: BitRef): number {
  return ref.byte * 8 + ref.bit;
}

/** System bits (area S), provided by the engine on every scan. */
export const SYSTEM_BITS = {
  /** Always TRUE. */
  alwaysOn: 'S0.0',
  /** TRUE only during the first scan after entering RUN. */
  firstScan: 'S0.1',
  /** 1 Hz clock based on simulated time: TRUE during the first half of every second. */
  clock1Hz: 'S0.2',
} as const;
