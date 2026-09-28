/**
 * Address display styles (spec 6.5). Memory is always the same; only the notation changes, so
 * learners can compare how each brand names the same thing. Areas without a faithful brand
 * equivalent keep the generic notation rather than inventing one.
 *
 * - Siemens (S7-1200 style): bits unchanged; words start at MW100 (even byte offsets) so they do
 *   not collide with the marker bytes; onboard analog I/O at IW64/QW64; system and clock memory
 *   shown with TIA Portal's default tag names.
 * - Allen-Bradley (SLC 500 / MicroLogix file addressing): I:0/k, O:0/k, B3, N7, F8, T4, C5,
 *   status file S:1/15 = first pass. (ControlLogix uses named tags instead of addresses.)
 * - Mitsubishi (FX series): X/Y in octal, M, D registers, special relays M8000/M8002/M8013.
 * - Omron (CP1 series): CIO 0.00 inputs, 100.00 outputs, W work bits, D words, analog CIO
 *   200/210 (CP1H-XA), system flags P_On / P_First_Cycle / P_1s.
 */
import { parseAddress, formatAddress } from '@/simulator/engine';

export const ADDRESS_STYLES = ['generic', 'siemens', 'ab', 'mitsubishi', 'omron'] as const;
export type AddressStyle = (typeof ADDRESS_STYLES)[number];

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

/** Display names of the system bits S0.0 (always on), S0.1 (first scan), S0.2 (1 Hz clock). */
const SYSTEM: Record<Exclude<AddressStyle, 'generic'>, [string, string, string]> = {
  siemens: ['AlwaysTRUE', 'FirstScan', 'Clock_1Hz'],
  ab: ['ALWAYS_ON', 'S:1/15', 'CLOCK_1HZ'],
  mitsubishi: ['M8000', 'M8002', 'M8013'],
  omron: ['P_On', 'P_First_Cycle', 'P_1s'],
};

/**
 * Formats a canonical address in a brand style. Returns the input unchanged when it is not an
 * address (e.g. a literal) or the style has no equivalent.
 */
export function formatAddressStyled(address: string, style: AddressStyle): string {
  const ref = parseAddress(address);
  if (!ref) return address;
  const canonical = formatAddress(ref);
  if (style === 'generic') return canonical;

  switch (ref.kind) {
    case 'bit': {
      const k = ref.byte * 8 + ref.bit;
      if (ref.area === 'S') return SYSTEM[style][k] ?? canonical;
      switch (style) {
        case 'siemens':
        default:
          return canonical;
        case 'ab':
          if (ref.area === 'I') return `I:${ref.byte >> 1}/${k % 16}`;
          if (ref.area === 'Q') return `O:${ref.byte >> 1}/${k % 16}`;
          return `B3:${k >> 4}/${k & 15}`;
        case 'mitsubishi':
          if (ref.area === 'I') return `X${k.toString(8)}`;
          if (ref.area === 'Q') return `Y${k.toString(8)}`;
          return `M${k}`;
        case 'omron':
          if (ref.area === 'I') return `${k >> 4}.${pad2(k & 15)}`;
          if (ref.area === 'Q') return `${100 + (k >> 4)}.${pad2(k & 15)}`;
          return `W${k >> 4}.${pad2(k & 15)}`;
      }
    }
    case 'word': {
      const n = ref.index;
      switch (style) {
        default:
        case 'siemens':
          if (ref.area === 'MW') return `MW${100 + 2 * n}`;
          if (ref.area === 'MD') return `MD${300 + 4 * n}`;
          return `${ref.area}${64 + 2 * n}`;
        case 'ab':
          if (ref.area === 'MW') return `N7:${n}`;
          if (ref.area === 'MD') return `F8:${n}`;
          return ref.area === 'IW' ? `I:1.${n}` : `O:1.${n}`;
        case 'mitsubishi':
          if (ref.area === 'MW') return `D${n}`;
          if (ref.area === 'MD') return `D${100 + 2 * n}`;
          return canonical;
        case 'omron':
          if (ref.area === 'MW') return `D${n}`;
          if (ref.area === 'MD') return `D${100 + 2 * n}`;
          return ref.area === 'IW' ? `${200 + n}` : `${210 + n}`;
      }
    }
    case 'timer':
    case 'counter': {
      const isTimer = ref.kind === 'timer';
      const n = ref.index;
      const m = ref.member;
      switch (style) {
        case 'siemens':
        default:
          return canonical;
        case 'ab': {
          const file = isTimer ? `T4:${n}` : `C5:${n}`;
          if (m === 'Q' || m === 'QU') return `${file}/DN`;
          if (m === 'ET' || m === 'CV') return `${file}.ACC`;
          if (m === 'PT' || m === 'PV') return `${file}.PRE`;
          if (m === 'IN') return `${file}/EN`;
          return canonical;
        }
        case 'mitsubishi':
          return m === 'Q' ? `${isTimer ? 'T' : 'C'}${n}` : canonical;
        case 'omron':
          return m === 'Q' ? `${isTimer ? 'T' : 'C'}${pad4(n)}` : canonical;
      }
    }
  }
}
