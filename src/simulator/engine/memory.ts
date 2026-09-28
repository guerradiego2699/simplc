/**
 * PLC memory: bit areas (process images and markers), physical I/O and edge memory.
 *
 * Every bit is stored as one element of a Uint8Array (0 or 1) — simple, fast and easy to
 * snapshot. Word/real/timer/counter areas are added in Phase 5.
 */
import { bitIndex, type BitArea, type BitRef } from './address';

export interface MemoryLayout {
  /** Digital input bytes (8 inputs each). */
  inputBytes: number;
  /** Digital output bytes (8 outputs each). */
  outputBytes: number;
  /** Marker bytes (8 bits each). */
  markerBytes: number;
  /** The first N marker bytes keep their value across a warm restart (STOP → RUN). */
  retentiveMarkerBytes: number;
}

/** 16 inputs and 16 outputs, like the training panel (spec 6.6); 256 marker bits. */
export const DEFAULT_LAYOUT: MemoryLayout = {
  inputBytes: 2,
  outputBytes: 2,
  markerBytes: 32,
  retentiveMarkerBytes: 0,
};

const SYSTEM_BYTES = 1;

export class Memory {
  readonly layout: MemoryLayout;

  /** Process images and markers, as seen by the program. */
  readonly bits: Record<BitArea, Uint8Array>;

  /** Terminal states: written by the I/O panel or a plant, read at the start of each scan. */
  readonly physicalInputs: Uint8Array;
  /** Terminal states: written at the end of each scan. */
  readonly physicalOutputs: Uint8Array;

  /** Previous value of every edge detector, by instance id. */
  readonly edges = new Map<string, boolean>();

  constructor(layout: MemoryLayout = DEFAULT_LAYOUT) {
    if (layout.retentiveMarkerBytes > layout.markerBytes) {
      throw new RangeError('retentiveMarkerBytes cannot exceed markerBytes');
    }
    this.layout = layout;
    this.bits = {
      I: new Uint8Array(layout.inputBytes * 8),
      Q: new Uint8Array(layout.outputBytes * 8),
      M: new Uint8Array(layout.markerBytes * 8),
      S: new Uint8Array(SYSTEM_BYTES * 8),
    };
    this.physicalInputs = new Uint8Array(layout.inputBytes * 8);
    this.physicalOutputs = new Uint8Array(layout.outputBytes * 8);
  }

  /** True when the address exists in this layout. */
  contains(ref: BitRef): boolean {
    return bitIndex(ref) < this.bits[ref.area].length;
  }

  get(ref: BitRef): boolean {
    return this.bits[ref.area][bitIndex(ref)] === 1;
  }

  set(ref: BitRef, value: boolean): void {
    this.bits[ref.area][bitIndex(ref)] = value ? 1 : 0;
  }

  /**
   * Warm restart (STOP → RUN): clears images, non-retentive markers and edge memory.
   * A cold restart also clears the retentive markers.
   */
  restart(cold: boolean): void {
    this.bits.I.fill(0);
    this.bits.Q.fill(0);
    this.bits.S.fill(0);
    this.bits.M.fill(0, cold ? 0 : this.layout.retentiveMarkerBytes * 8);
    this.physicalOutputs.fill(0);
    this.edges.clear();
  }
}
