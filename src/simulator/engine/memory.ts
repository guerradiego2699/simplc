/**
 * PLC memory: bit areas (process images and markers), word areas, timers, counters, physical
 * I/O and edge memory.
 *
 * Bits are one element of a Uint8Array (0 or 1). INT words live in Int16Arrays, so storing a
 * value wraps around at ±32768 exactly like a 16-bit PLC register; REAL words live in
 * Float32Arrays.
 */
import { bitIndex, type AddressRef, type BitArea, type BitRef, type WordArea } from './address';

export interface MemoryLayout {
  /** Digital input bytes (8 inputs each). */
  inputBytes: number;
  /** Digital output bytes (8 outputs each). */
  outputBytes: number;
  /** Marker bytes (8 bits each). */
  markerBytes: number;
  /** The first N marker bytes keep their value across a warm restart (STOP → RUN). */
  retentiveMarkerBytes: number;
  /** INT memory words (MW0…). */
  memoryWords: number;
  /** REAL memory words (MD0…). */
  realWords: number;
  /** The first N MW words keep their value across a warm restart. */
  retentiveWords: number;
  /** Analog input / output channels (IW0…, QW0…). */
  analogInputs: number;
  analogOutputs: number;
  /** Timer and counter instances (T0…, C0…). */
  timers: number;
  counters: number;
}

/** 16 DI / 16 DO like the training panel (spec 6.6), 2 AI / 2 AO, 256 markers, 64 INT, 32 REAL. */
export const DEFAULT_LAYOUT: MemoryLayout = {
  inputBytes: 2,
  outputBytes: 2,
  markerBytes: 32,
  retentiveMarkerBytes: 0,
  memoryWords: 64,
  realWords: 32,
  retentiveWords: 0,
  analogInputs: 2,
  analogOutputs: 2,
  timers: 32,
  counters: 32,
};

const SYSTEM_BYTES = 1;

export type TimerType = 'TON' | 'TOF' | 'TP';
export type CounterType = 'CTU' | 'CTD' | 'CTUD';

export interface TimerState {
  /** Last instruction type that used this instance (null = never called). */
  type: TimerType | null;
  in: boolean;
  q: boolean;
  /** Elapsed time, ms. */
  et: number;
  /** Preset time, ms (as given in the last call). */
  pt: number;
  /** Simulated time at which the current timing started. */
  start: number;
  running: boolean;
}

export interface CounterState {
  type: CounterType | null;
  cv: number;
  pv: number;
  qu: boolean;
  qd: boolean;
  /** Previous CU / CD inputs, for edge detection. */
  cu: boolean;
  cd: boolean;
}

const newTimer = (): TimerState => ({
  type: null,
  in: false,
  q: false,
  et: 0,
  pt: 0,
  start: 0,
  running: false,
});
const newCounter = (): CounterState => ({
  type: null,
  cv: 0,
  pv: 0,
  qu: false,
  qd: false,
  cu: false,
  cd: false,
});

export class Memory {
  readonly layout: MemoryLayout;

  /** Process images and markers, as seen by the program. */
  readonly bits: Record<BitArea, Uint8Array>;
  /** Word images: MW (INT), MD (REAL), IW (analog input image), QW (analog output image). */
  readonly words: Record<WordArea, Int16Array | Float32Array>;

  /** Terminal states: written by the I/O panel or a plant, read at the start of each scan. */
  readonly physicalInputs: Uint8Array;
  readonly physicalAnalogInputs: Int16Array;
  /** Terminal states: written at the end of each scan. */
  readonly physicalOutputs: Uint8Array;
  readonly physicalAnalogOutputs: Int16Array;

  readonly timers: TimerState[];
  readonly counters: CounterState[];

  /** Previous value of every edge detector, by instance id. */
  readonly edges = new Map<string, boolean>();

  constructor(layout: MemoryLayout = DEFAULT_LAYOUT) {
    if (layout.retentiveMarkerBytes > layout.markerBytes) {
      throw new RangeError('retentiveMarkerBytes cannot exceed markerBytes');
    }
    if (layout.retentiveWords > layout.memoryWords) {
      throw new RangeError('retentiveWords cannot exceed memoryWords');
    }
    this.layout = layout;
    this.bits = {
      I: new Uint8Array(layout.inputBytes * 8),
      Q: new Uint8Array(layout.outputBytes * 8),
      M: new Uint8Array(layout.markerBytes * 8),
      S: new Uint8Array(SYSTEM_BYTES * 8),
    };
    this.words = {
      MW: new Int16Array(layout.memoryWords),
      MD: new Float32Array(layout.realWords),
      IW: new Int16Array(layout.analogInputs),
      QW: new Int16Array(layout.analogOutputs),
    };
    this.physicalInputs = new Uint8Array(layout.inputBytes * 8);
    this.physicalOutputs = new Uint8Array(layout.outputBytes * 8);
    this.physicalAnalogInputs = new Int16Array(layout.analogInputs);
    this.physicalAnalogOutputs = new Int16Array(layout.analogOutputs);
    this.timers = Array.from({ length: layout.timers }, newTimer);
    this.counters = Array.from({ length: layout.counters }, newCounter);
  }

  /** True when a bit address exists in this layout. */
  contains(ref: BitRef): boolean {
    return bitIndex(ref) < this.bits[ref.area].length;
  }

  /** True when any address exists in this layout. */
  containsAddress(ref: AddressRef): boolean {
    switch (ref.kind) {
      case 'bit':
        return this.contains(ref);
      case 'word':
        return ref.index < this.words[ref.area].length;
      case 'timer':
        return ref.index < this.timers.length;
      case 'counter':
        return ref.index < this.counters.length;
    }
  }

  get(ref: BitRef): boolean {
    return this.bits[ref.area][bitIndex(ref)] === 1;
  }

  set(ref: BitRef, value: boolean): void {
    this.bits[ref.area][bitIndex(ref)] = value ? 1 : 0;
  }

  /** Reads any address: booleans for bits/Q outputs, numbers for words and ET/PT/CV/PV. */
  read(ref: AddressRef): boolean | number {
    switch (ref.kind) {
      case 'bit':
        return this.get(ref);
      case 'word':
        return this.words[ref.area][ref.index] ?? 0;
      case 'timer': {
        const t = this.timers[ref.index] as TimerState;
        return ref.member === 'ET'
          ? t.et
          : ref.member === 'PT'
            ? t.pt
            : ref.member === 'IN'
              ? t.in
              : t.q;
      }
      case 'counter': {
        const c = this.counters[ref.index] as CounterState;
        switch (ref.member) {
          case 'CV':
            return c.cv;
          case 'PV':
            return c.pv;
          case 'QU':
            return c.qu;
          case 'QD':
            return c.qd;
          default:
            return c.type === 'CTD' ? c.qd : c.qu;
        }
      }
    }
  }

  /**
   * Warm restart (STOP → RUN): clears images, non-retentive markers and words, timers,
   * counters and edge memory. A cold restart also clears the retentive areas.
   */
  restart(cold: boolean): void {
    this.bits.I.fill(0);
    this.bits.Q.fill(0);
    this.bits.S.fill(0);
    this.bits.M.fill(0, cold ? 0 : this.layout.retentiveMarkerBytes * 8);
    this.words.MW.fill(0, cold ? 0 : this.layout.retentiveWords);
    this.words.MD.fill(0);
    this.words.IW.fill(0);
    this.words.QW.fill(0);
    this.physicalOutputs.fill(0);
    this.physicalAnalogOutputs.fill(0);
    // Reset in place: compiled programs keep references to these state objects.
    for (const t of this.timers) Object.assign(t, newTimer(), { pt: t.pt });
    for (const c of this.counters) Object.assign(c, newCounter(), { pv: c.pv });
    this.edges.clear();
  }
}
