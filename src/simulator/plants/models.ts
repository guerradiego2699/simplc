/**
 * The plant models. Addresses are fixed per plant and documented in each example.
 */
import type { PlantId, PlantModel } from './types';

// ---------------------------------------------------------------------------------------------
// 1. Lamp: Q0.0 lights a bulb. No sensors.
// ---------------------------------------------------------------------------------------------

export const lampPlant: PlantModel<Record<string, never>> = {
  id: 'lamp',
  sensors: [],
  actuators: ['Q0.0'],
  initial: () => ({}),
  step: (s) => s,
  read: () => ({}),
};

// ---------------------------------------------------------------------------------------------
// 2. Motor with contactor and thermal overload relay.
//    Q0.0 = contactor coil. I0.2 = overload relay NC contact (1 = OK, 0 = tripped).
//    The motor accelerates / coasts down in about one second.
// ---------------------------------------------------------------------------------------------

export interface MotorState {
  /** 0 = stopped, 1 = full speed. */
  speed: number;
  /** Overload relay tripped (it stays tripped until reset, like a real relay). */
  tripped: boolean;
}

export const MOTOR_ACCEL_PER_S = 1.5;
export const MOTOR_DECEL_PER_S = 0.8;

export const motorPlant: PlantModel<MotorState> = {
  id: 'motor',
  sensors: ['I0.2'],
  actuators: ['Q0.0'],
  initial: () => ({ speed: 0, tripped: false }),
  step(s, dtMs, output) {
    // The overload relay's main contacts also cut the motor power when it trips.
    const powered = output('Q0.0') && !s.tripped;
    const dt = dtMs / 1000;
    const speed = powered
      ? Math.min(1, s.speed + MOTOR_ACCEL_PER_S * dt)
      : Math.max(0, s.speed - MOTOR_DECEL_PER_S * dt);
    return speed === s.speed ? s : { ...s, speed };
  },
  read: (s) => ({ 'I0.2': !s.tripped }),
  command(s, name) {
    if (name === 'overload') return { ...s, tripped: true };
    if (name === 'resetOverload') return { ...s, tripped: false };
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// 4. Traffic lights for a crossing: direction A = Q0.0 red, Q0.1 amber, Q0.2 green;
//    direction B = Q0.3 red, Q0.4 amber, Q0.5 green. No sensors.
// ---------------------------------------------------------------------------------------------

export const trafficPlant: PlantModel<Record<string, never>> = {
  id: 'traffic',
  sensors: [],
  actuators: ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'Q0.4', 'Q0.5'],
  initial: () => ({}),
  step: (s) => s,
  read: () => ({}),
};

// ---------------------------------------------------------------------------------------------
// 6. Tank: Q0.0 = pump (fills), a consumer draws water (operator can turn it off).
//    I0.2 = low level switch (1 when water covers it, level ≥ 20 %),
//    I0.3 = high level switch (1 when level ≥ 80 %).
// ---------------------------------------------------------------------------------------------

export interface TankState {
  /** 0–100 %. */
  level: number;
  consumption: boolean;
}

export const TANK = { inflowPerS: 10, outflowPerS: 4, low: 20, high: 80 } as const;

export const tankPlant: PlantModel<TankState> = {
  id: 'tank',
  sensors: ['I0.2', 'I0.3'],
  actuators: ['Q0.0'],
  initial: () => ({ level: 10, consumption: true }),
  step(s, dtMs, output) {
    const dt = dtMs / 1000;
    const delta = (output('Q0.0') ? TANK.inflowPerS : 0) - (s.consumption ? TANK.outflowPerS : 0);
    const level = Math.min(100, Math.max(0, s.level + delta * dt));
    return level === s.level ? s : { ...s, level };
  },
  read: (s) => ({ 'I0.2': s.level >= TANK.low, 'I0.3': s.level >= TANK.high }),
  command(s, name) {
    return name === 'toggleConsumption' ? { ...s, consumption: !s.consumption } : s;
  },
};

export const PLANTS: Record<PlantId, PlantModel> = {
  lamp: lampPlant,
  motor: motorPlant as PlantModel,
  traffic: trafficPlant,
  tank: tankPlant as PlantModel,
};
