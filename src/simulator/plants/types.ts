/**
 * Virtual plants (spec 6.7): simple physical processes connected to the PLC I/O.
 *
 * A plant reads the PLC's physical outputs (actuators), advances its physics in SIMULATED time
 * after every scan, and drives some PLC inputs (sensors). Pure TypeScript, like the engine:
 * no React, no DOM, no timers — so it can be tested and run fast in challenges.
 */

export const PLANT_IDS = ['lamp', 'motor', 'traffic', 'tank'] as const;
export type PlantId = (typeof PLANT_IDS)[number];

export interface PlantModel<S = unknown> {
  id: PlantId;
  /** PLC input addresses written by the plant (they override the I/O panel). */
  sensors: readonly string[];
  /** PLC output addresses the plant reacts to (for documentation and the UI). */
  actuators: readonly string[];
  initial(): S;
  /** Advances the physics by `dtMs` of simulated time. `output(address)` = physical output. */
  step(state: S, dtMs: number, output: (address: string) => boolean): S;
  /** Current sensor values, by input address. */
  read(state: S): Record<string, boolean>;
  /** Operator actions on the plant itself (e.g. simulate an overload). */
  command?(state: S, name: string): S;
}

export const isPlantId = (value: unknown): value is PlantId =>
  typeof value === 'string' && (PLANT_IDS as readonly string[]).includes(value);
