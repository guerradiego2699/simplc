/**
 * Couples a plant to the PLC runtime, one scan at a time:
 *   plant sensors → PLC inputs → scan → PLC outputs → plant physics (one cycle of time).
 * Used by the simulator UI and (later) by the challenge validator.
 */
import type { PlcRuntime } from '@/simulator/engine';
import type { PlantModel } from './types';

/** Writes the plant's sensor values into the PLC's physical inputs. */
export function applySensors<S>(runtime: PlcRuntime, plant: PlantModel<S>, state: S): void {
  for (const [address, value] of Object.entries(plant.read(state))) {
    if (typeof value === 'number') runtime.setAnalogInput(address, Math.round(value));
    else runtime.setInput(address, value);
  }
}

/** Advances the plant by one scan cycle of simulated time, reading the physical outputs. */
export function stepPlant<S>(runtime: PlcRuntime, plant: PlantModel<S>, state: S): S {
  return plant.step(state, runtime.cycleTimeMs, {
    bit: (address) => runtime.getOutput(address),
    word: (address) => runtime.getAnalogOutput(address),
  });
}

/** One complete coupled cycle: sensors → scan → physics. Returns the new plant state. */
export function scanWithPlant<S>(runtime: PlcRuntime, plant: PlantModel<S>, state: S): S {
  applySensors(runtime, plant, state);
  runtime.scan();
  return runtime.mode === 'RUN' ? stepPlant(runtime, plant, state) : state;
}
