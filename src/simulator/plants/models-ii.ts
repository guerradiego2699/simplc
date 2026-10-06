/**
 * Plants for the second set of examples (spec section 7: 3, 5, 7, 8, 9, 10, 12, 13, 14).
 * Same rules as models.ts: fixed addresses, simple physics, simulated time only.
 */
import { ANALOG_FULL_SCALE, type PlantModel } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const approach = (v: number, target: number, maxStep: number) =>
  v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);

// ---------------------------------------------------------------------------------------------
// 3. Reversing motor. Q0.0 = forward contactor, Q0.1 = reverse contactor, I0.3 = overload NC.
//    Both contactors on at once is a short circuit: the breaker trips (latched until reset).
// ---------------------------------------------------------------------------------------------

export interface ReversingState {
  /** −1 = full reverse … 1 = full forward. */
  speed: number;
  tripped: boolean;
  shortCircuit: boolean;
}

export const reversingPlant: PlantModel<ReversingState> = {
  id: 'reversing',
  sensors: ['I0.3'],
  actuators: ['Q0.0', 'Q0.1'],
  initial: () => ({ speed: 0, tripped: false, shortCircuit: false }),
  step(s, dtMs, io) {
    const fwd = io.bit('Q0.0');
    const rev = io.bit('Q0.1');
    const shortCircuit = s.shortCircuit || (fwd && rev);
    const powered = !shortCircuit && !s.tripped && fwd !== rev;
    const dt = dtMs / 1000;
    const speed = powered
      ? approach(s.speed, fwd ? 1 : -1, 1.5 * dt)
      : approach(s.speed, 0, 0.8 * dt);
    return speed === s.speed && shortCircuit === s.shortCircuit ? s : { ...s, speed, shortCircuit };
  },
  read: (s) => ({ 'I0.3': !s.tripped }),
  command(s, name) {
    if (name === 'overload') return { ...s, tripped: true };
    if (name === 'resetOverload') return { ...s, tripped: false, shortCircuit: false };
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// 5. Automatic gate. Q0.0 = open motor, Q0.1 = close motor, Q0.2 = warning light.
//    I0.2 = open limit switch, I0.3 = closed limit switch, I0.4 = photocell (1 = beam clear).
// ---------------------------------------------------------------------------------------------

export interface GateState {
  /** 0 = closed … 100 = open. */
  position: number;
  obstacle: boolean;
  /** The gate closed onto the obstacle (latched until the obstacle is removed). */
  hit: boolean;
  /** Both motors were ordered at once. */
  jammed: boolean;
}

export const GATE = { speedPerS: 12.5, carZone: 45 } as const;

export const gatePlant: PlantModel<GateState> = {
  id: 'gate',
  sensors: ['I0.2', 'I0.3', 'I0.4'],
  actuators: ['Q0.0', 'Q0.1', 'Q0.2'],
  initial: () => ({ position: 0, obstacle: false, hit: false, jammed: false }),
  step(s, dtMs, io) {
    const open = io.bit('Q0.0');
    const close = io.bit('Q0.1');
    const jammed = open && close;
    const dt = dtMs / 1000;
    let position = s.position;
    if (!jammed && open) position = clamp(position + GATE.speedPerS * dt, 0, 100);
    if (!jammed && close) position = clamp(position - GATE.speedPerS * dt, 0, 100);
    // Closing onto a car standing in the gate: it can only close down to the car.
    let hit = s.hit && s.obstacle;
    if (s.obstacle && position < GATE.carZone) {
      if (close && !jammed) hit = true;
      position = GATE.carZone;
    }
    return position === s.position && hit === s.hit && jammed === s.jammed
      ? s
      : { ...s, position, hit, jammed };
  },
  read: (s) => ({
    'I0.2': s.position >= 100,
    'I0.3': s.position <= 0,
    'I0.4': !s.obstacle,
  }),
  command(s, name) {
    if (name !== 'toggleObstacle') return s;
    // A car can only stand in the gate while it is at least partly open.
    if (!s.obstacle && s.position < GATE.carZone) return s;
    return { ...s, obstacle: !s.obstacle, hit: false };
  },
};

// ---------------------------------------------------------------------------------------------
// 7. Star–delta starter. Q0.0 = main contactor K1, Q0.1 = star K2, Q0.2 = delta K3,
//    I0.2 = overload NC. Star and delta together is a short circuit.
//    Current in multiples of the rated current: about 6× at standstill in delta, 1/3 in star.
// ---------------------------------------------------------------------------------------------

export interface StarDeltaState {
  speed: number;
  /** Line current, × rated current. */
  current: number;
  /** Highest current seen since the last start (to compare starting methods). */
  peak: number;
  tripped: boolean;
  shortCircuit: boolean;
}

export const starDeltaPlant: PlantModel<StarDeltaState> = {
  id: 'starDelta',
  sensors: ['I0.2'],
  actuators: ['Q0.0', 'Q0.1', 'Q0.2'],
  initial: () => ({ speed: 0, current: 0, peak: 0, tripped: false, shortCircuit: false }),
  step(s, dtMs, io) {
    const main = io.bit('Q0.0');
    const star = io.bit('Q0.1');
    const delta = io.bit('Q0.2');
    const shortCircuit = s.shortCircuit || (star && delta);
    const ok = main && !shortCircuit && !s.tripped;
    const dt = dtMs / 1000;
    let speed: number;
    let current = 0;
    if (ok && star && !delta) {
      speed = approach(s.speed, 0.9, 0.25 * dt);
      current = (1 + 5 * (1 - s.speed)) / 3;
    } else if (ok && delta && !star) {
      speed = approach(s.speed, 1, 0.6 * dt);
      current = 1 + 5 * (1 - s.speed);
    } else {
      speed = approach(s.speed, 0, 0.3 * dt);
    }
    // A new start (motor stopped) resets the peak memory.
    const peak = current === 0 && speed === 0 ? 0 : Math.max(s.peak, current);
    return { ...s, speed, current, peak, shortCircuit };
  },
  read: (s) => ({ 'I0.2': !s.tripped }),
  command(s, name) {
    if (name === 'overload') return { ...s, tripped: true };
    if (name === 'resetOverload') return { ...s, tripped: false, shortCircuit: false };
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// 8. Conveyor with box counter. Q0.0 = belt motor, Q0.1 = "batch ready" light,
//    I0.2 = box sensor (photocell at 62 % of the belt).
// ---------------------------------------------------------------------------------------------

export interface ConveyorState {
  /** Positions (0–100 %) of the boxes on the belt. */
  boxes: number[];
  delivered: number;
}

export const CONVEYOR = { speedPerS: 20, spacing: 30, sensorAt: 62, halfBox: 4 } as const;

export const conveyorPlant: PlantModel<ConveyorState> = {
  id: 'conveyor',
  sensors: ['I0.2'],
  actuators: ['Q0.0', 'Q0.1'],
  initial: () => ({ boxes: [0], delivered: 0 }),
  step(s, dtMs, io) {
    if (!io.bit('Q0.0')) return s;
    const move = CONVEYOR.speedPerS * (dtMs / 1000);
    let boxes = s.boxes.map((p) => p + move);
    const delivered = s.delivered + boxes.filter((p) => p > 100).length;
    boxes = boxes.filter((p) => p <= 100);
    const last = boxes.at(-1);
    if (last === undefined || last >= CONVEYOR.spacing) boxes.push(0);
    return { boxes, delivered };
  },
  read: (s) => ({
    'I0.2': s.boxes.some((p) => Math.abs(p - CONVEYOR.sensorAt) <= CONVEYOR.halfBox),
  }),
};

// ---------------------------------------------------------------------------------------------
// 9. Car park. Q0.0 = "FULL" sign, Q0.1 = entry barrier.
//    I0.0 = entry sensor (a car going in), I0.1 = exit sensor (a car going out),
//    I0.2 = a car is waiting at the entry barrier.
// ---------------------------------------------------------------------------------------------

export interface ParkingState {
  waiting: number;
  parked: number;
  /** Remaining ms of the car crossing the entry / exit sensor. */
  entering: number;
  leaving: number;
  /** How long the barrier has been open for the waiting car. */
  barrierMs: number;
}

export const PARKING = { capacity: 10, maxQueue: 5, crossMs: 600, openMs: 800 } as const;

export const parkingPlant: PlantModel<ParkingState> = {
  id: 'parking',
  sensors: ['I0.0', 'I0.1', 'I0.2'],
  actuators: ['Q0.0', 'Q0.1'],
  initial: () => ({ waiting: 0, parked: 0, entering: 0, leaving: 0, barrierMs: 0 }),
  step(s, dtMs, io) {
    let { waiting, parked, entering, leaving, barrierMs } = s;
    const barrier = io.bit('Q0.1');
    if (entering > 0) {
      entering = Math.max(0, entering - dtMs);
      if (entering === 0) parked++;
    } else if (waiting > 0 && barrier) {
      barrierMs += dtMs;
      if (barrierMs >= PARKING.openMs) {
        waiting--;
        entering = PARKING.crossMs;
        barrierMs = 0;
      }
    } else {
      barrierMs = 0;
    }
    if (leaving > 0) leaving = Math.max(0, leaving - dtMs);
    return { waiting, parked, entering, leaving, barrierMs };
  },
  read: (s) => ({
    'I0.0': s.entering > 0,
    'I0.1': s.leaving > 0,
    'I0.2': s.waiting > 0 && s.entering === 0,
  }),
  command(s, name) {
    if (name === 'carArrives' && s.waiting < PARKING.maxQueue)
      return { ...s, waiting: s.waiting + 1 };
    if (name === 'carLeaves' && s.parked > 0 && s.leaving === 0) {
      return { ...s, parked: s.parked - 1, leaving: PARKING.crossMs };
    }
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// 10. Sorting by size. Q0.0 = belt, Q0.1 = piston. I0.2 = low sensor (every piece),
//     I0.3 = high sensor (only large pieces), both at 50 % of the belt; the piston is at 75 %.
// ---------------------------------------------------------------------------------------------

export interface Piece {
  pos: number;
  large: boolean;
}

export interface SorterState {
  pieces: Piece[];
  /** Index in the repeating size pattern. */
  next: number;
  /** Pieces sorted to the right place / to the wrong place. */
  ok: number;
  wrong: number;
}

export const SORTER = {
  speedPerS: 20,
  spacing: 30,
  sensorAt: 50,
  pistonAt: 75,
  reach: 4,
  pattern: [false, true, false, false, true, true, false, true],
} as const;

export const sorterPlant: PlantModel<SorterState> = {
  id: 'sorter',
  sensors: ['I0.2', 'I0.3'],
  actuators: ['Q0.0', 'Q0.1'],
  initial: () => ({ pieces: [{ pos: 0, large: SORTER.pattern[0]! }], next: 1, ok: 0, wrong: 0 }),
  step(s, dtMs, io) {
    let { ok, wrong, next } = s;
    let pieces = s.pieces;
    if (io.bit('Q0.0')) {
      const move = SORTER.speedPerS * (dtMs / 1000);
      pieces = pieces.map((p) => ({ ...p, pos: p.pos + move }));
    }
    // The piston pushes the piece in front of it into the side bin (meant for large pieces).
    if (io.bit('Q0.1')) {
      pieces = pieces.filter((p) => {
        if (Math.abs(p.pos - SORTER.pistonAt) > SORTER.reach) return true;
        if (p.large) ok++;
        else wrong++;
        return false;
      });
    }
    // At the end of the belt only small pieces should arrive.
    pieces = pieces.filter((p) => {
      if (p.pos <= 100) return true;
      if (p.large) wrong++;
      else ok++;
      return false;
    });
    const last = pieces.at(-1);
    if (last === undefined || last.pos >= SORTER.spacing) {
      pieces = [...pieces, { pos: 0, large: SORTER.pattern[next % SORTER.pattern.length]! }];
      next++;
    }
    return { pieces, next, ok, wrong };
  },
  read: (s) => {
    const atSensor = s.pieces.filter((p) => Math.abs(p.pos - SORTER.sensorAt) <= 3);
    return { 'I0.2': atSensor.length > 0, 'I0.3': atSensor.some((p) => p.large) };
  },
};

// ---------------------------------------------------------------------------------------------
// 12. Two pumps with alternation and backup. Q0.0 = pump 1, Q0.1 = pump 2, Q0.2 = alarm light.
//     I0.2 = low level, I0.3 = high level, I0.4 / I0.5 = pump 1 / 2 OK (NC fault contacts).
// ---------------------------------------------------------------------------------------------

export interface PumpsState {
  level: number;
  consumption: boolean;
  fault1: boolean;
  fault2: boolean;
  /** Running time of each pump, ms (to see the alternation). */
  run1: number;
  run2: number;
}

export const PUMPS = { inflowPerS: 9, outflowPerS: 4, low: 20, high: 80 } as const;

export const pumpsPlant: PlantModel<PumpsState> = {
  id: 'pumps',
  sensors: ['I0.2', 'I0.3', 'I0.4', 'I0.5'],
  actuators: ['Q0.0', 'Q0.1', 'Q0.2'],
  initial: () => ({ level: 15, consumption: true, fault1: false, fault2: false, run1: 0, run2: 0 }),
  step(s, dtMs, io) {
    const p1 = io.bit('Q0.0') && !s.fault1;
    const p2 = io.bit('Q0.1') && !s.fault2;
    const dt = dtMs / 1000;
    const delta =
      (Number(p1) + Number(p2)) * PUMPS.inflowPerS - (s.consumption ? PUMPS.outflowPerS : 0);
    return {
      ...s,
      level: clamp(s.level + delta * dt, 0, 100),
      run1: s.run1 + (p1 ? dtMs : 0),
      run2: s.run2 + (p2 ? dtMs : 0),
    };
  },
  read: (s) => ({
    'I0.2': s.level >= PUMPS.low,
    'I0.3': s.level >= PUMPS.high,
    'I0.4': !s.fault1,
    'I0.5': !s.fault2,
  }),
  command(s, name) {
    if (name === 'toggleFault1') return { ...s, fault1: !s.fault1 };
    if (name === 'toggleFault2') return { ...s, fault2: !s.fault2 };
    if (name === 'toggleConsumption') return { ...s, consumption: !s.consumption };
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// 13. Oven with on/off control. Q0.0 = heater. IW0 = temperature transmitter, 0–300 °C as
//     0–27648. Heat losses grow with the difference to the room (20 °C); an open door loses more.
// ---------------------------------------------------------------------------------------------

export interface OvenState {
  temp: number;
  doorOpen: boolean;
}

export const OVEN = { ambient: 20, heatPerS: 6, loss: 0.015, range: 300 } as const;

export const ovenPlant: PlantModel<OvenState> = {
  id: 'oven',
  sensors: ['IW0'],
  actuators: ['Q0.0'],
  initial: () => ({ temp: OVEN.ambient, doorOpen: false }),
  step(s, dtMs, io) {
    const loss = OVEN.loss * (s.doorOpen ? 4 : 1) * (s.temp - OVEN.ambient);
    const temp = s.temp + ((io.bit('Q0.0') ? OVEN.heatPerS : 0) - loss) * (dtMs / 1000);
    return { ...s, temp: clamp(temp, -40, OVEN.range) };
  },
  read: (s) => ({ IW0: clamp((s.temp / OVEN.range) * ANALOG_FULL_SCALE, 0, ANALOG_FULL_SCALE) }),
  command(s, name) {
    return name === 'toggleDoor' ? { ...s, doorOpen: !s.doorOpen } : s;
  },
};

// ---------------------------------------------------------------------------------------------
// 14. Analog level control. QW0 = inlet valve opening (0–27648 = 0–100 %),
//     IW0 = level transmitter (0–27648 = 0–100 %). A consumer drains the tank.
// ---------------------------------------------------------------------------------------------

export interface LevelControlState {
  level: number;
  consumption: boolean;
}

export const LEVEL = { maxInflowPerS: 12, outflowPerS: 5 } as const;

export const levelControlPlant: PlantModel<LevelControlState> = {
  id: 'levelControl',
  sensors: ['IW0'],
  actuators: ['QW0'],
  initial: () => ({ level: 20, consumption: true }),
  step(s, dtMs, io) {
    const opening = clamp(io.word('QW0') / ANALOG_FULL_SCALE, 0, 1);
    const delta = opening * LEVEL.maxInflowPerS - (s.consumption ? LEVEL.outflowPerS : 0);
    return { ...s, level: clamp(s.level + delta * (dtMs / 1000), 0, 100) };
  },
  read: (s) => ({ IW0: (s.level / 100) * ANALOG_FULL_SCALE }),
  command(s, name) {
    return name === 'toggleConsumption' ? { ...s, consumption: !s.consumption } : s;
  },
};
