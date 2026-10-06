/**
 * Virtual plants (spec 6.7): simple physical processes connected to the PLC I/O.
 *
 * A plant reads the PLC's physical outputs (actuators), advances its physics in SIMULATED time
 * after every scan, and drives some PLC inputs (sensors). Pure TypeScript, like the engine:
 * no React, no DOM, no timers — so it can be tested and run fast in challenges.
 */

export const PLANT_IDS = [
  'lamp',
  'motor',
  'reversing',
  'traffic',
  'gate',
  'tank',
  'starDelta',
  'conveyor',
  'parking',
  'sorter',
  'mixer',
  'pumps',
  'oven',
  'levelControl',
] as const;
export type PlantId = (typeof PLANT_IDS)[number];

/** What a plant can read from the PLC: digital outputs (Q0.0) and analog outputs (QW0, raw INT). */
export interface PlantIo {
  bit(address: string): boolean;
  word(address: string): number;
}

/** Full scale of analog signals (0–27648 = 0–100 %, the usual convention for 0–10 V / 4–20 mA). */
export const ANALOG_FULL_SCALE = 27648;

export interface PlantModel<S = unknown> {
  id: PlantId;
  /** PLC input addresses written by the plant (they override the I/O panel). */
  sensors: readonly string[];
  /** PLC output addresses the plant reacts to (for documentation and the UI). */
  actuators: readonly string[];
  initial(): S;
  /** Advances the physics by `dtMs` of simulated time, reading the PLC outputs. */
  step(state: S, dtMs: number, io: PlantIo): S;
  /** Current sensor values by input address: BOOL for I0.x, raw INT for IW0. */
  read(state: S): Record<string, boolean | number>;
  /** Operator actions on the plant itself (e.g. simulate an overload). */
  command?(state: S, name: string): S;
}

export const isPlantId = (value: unknown): value is PlantId =>
  typeof value === 'string' && (PLANT_IDS as readonly string[]).includes(value);
