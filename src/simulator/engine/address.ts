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

// ---------------------------------------------------------------------------------------------
// All addresses (Phase 5): bits, words, timers and counters
// ---------------------------------------------------------------------------------------------

/** Elementary data types (IEC 61131-3 names). TIME values are milliseconds. */
export type DataType = 'BOOL' | 'INT' | 'REAL' | 'TIME';

/**
 * Word areas. Each area is an independent array indexed by word number — there is no overlap
 * with the bit areas (unlike some brands). Brand display styles translate the notation.
 *   MW0 … INT memory words     MD0 … REAL memory doubles
 *   IW0 … analog inputs (INT)  QW0 … analog outputs (INT)
 */
export const WORD_AREAS = ['MW', 'MD', 'IW', 'QW'] as const;
export type WordArea = (typeof WORD_AREAS)[number];

export const TIMER_MEMBERS = ['Q', 'ET', 'PT', 'IN'] as const;
export type TimerMember = (typeof TIMER_MEMBERS)[number];
export const COUNTER_MEMBERS = ['Q', 'QU', 'QD', 'CV', 'PV'] as const;
export type CounterMember = (typeof COUNTER_MEMBERS)[number];

export type AddressRef =
  | ({ kind: 'bit' } & BitRef)
  | { kind: 'word'; area: WordArea; index: number }
  | { kind: 'timer'; index: number; member: TimerMember }
  | { kind: 'counter'; index: number; member: CounterMember };

const WORD_ADDRESS = /^%?(MW|MD|IW|QW)(\d{1,4})$/;
const TIMER_ADDRESS = /^T(\d{1,3})(?:\.(Q|ET|PT|IN))?$/;
const COUNTER_ADDRESS = /^C(\d{1,3})(?:\.(Q|QU|QD|CV|PV))?$/;

/** Parses any address. Bare T0 / C0 mean the Q output. Returns null if not an address. */
export function parseAddress(text: string): AddressRef | null {
  const t = text.trim().toUpperCase();
  const bit = parseBitAddress(t);
  if (bit) return { kind: 'bit', ...bit };
  let m = WORD_ADDRESS.exec(t);
  if (m) return { kind: 'word', area: m[1] as WordArea, index: Number(m[2]) };
  m = TIMER_ADDRESS.exec(t);
  if (m) return { kind: 'timer', index: Number(m[1]), member: (m[2] ?? 'Q') as TimerMember };
  m = COUNTER_ADDRESS.exec(t);
  if (m) return { kind: 'counter', index: Number(m[1]), member: (m[2] ?? 'Q') as CounterMember };
  return null;
}

export function formatAddress(ref: AddressRef): string {
  switch (ref.kind) {
    case 'bit':
      return formatBitAddress(ref);
    case 'word':
      return `${ref.area}${ref.index}`;
    case 'timer':
      return ref.member === 'Q' ? `T${ref.index}` : `T${ref.index}.${ref.member}`;
    case 'counter':
      return ref.member === 'Q' ? `C${ref.index}` : `C${ref.index}.${ref.member}`;
  }
}

/** Canonical spelling of any address ("%mw3" → "MW3", "t0.q" → "T0"), or null. */
export function normalizeAddress(text: string): string | null {
  const ref = parseAddress(text);
  return ref ? formatAddress(ref) : null;
}

export function typeOfAddress(ref: AddressRef): DataType {
  switch (ref.kind) {
    case 'bit':
      return 'BOOL';
    case 'word':
      return ref.area === 'MD' ? 'REAL' : 'INT';
    case 'timer':
      return ref.member === 'ET' || ref.member === 'PT' ? 'TIME' : 'BOOL';
    case 'counter':
      return ref.member === 'CV' || ref.member === 'PV' ? 'INT' : 'BOOL';
  }
}

/** Timer/counter members and system bits are read-only for the program. */
export function isWritable(ref: AddressRef): boolean {
  if (ref.kind === 'bit') return ref.area !== 'S';
  return ref.kind === 'word';
}

/** Instance name of a timer/counter operand ("T3", "c12") or null. */
export function parseInstance(text: string, kind: 'timer' | 'counter'): number | null {
  const ref = parseAddress(text);
  return ref && ref.kind === kind && ref.member === 'Q' ? ref.index : null;
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
