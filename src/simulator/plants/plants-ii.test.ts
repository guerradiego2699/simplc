import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { exampleProject, getExample } from '@/simulator/examples';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import { scanWithPlant } from './coupling';
import { PLANTS } from './models';
import {
  GATE,
  type ConveyorState,
  type GateState,
  type LevelControlState,
  type OvenState,
  type ParkingState,
  type PumpsState,
  type ReversingState,
  type SorterState,
  type StarDeltaState,
} from './models-ii';
import type { PlantModel } from './types';

/** Runs an example coupled to its plant; `run(ms, inputs)` advances simulated time. */
function runExample<S>(id: string) {
  const example = getExample(id)!;
  const project = exampleProject(example, 'es');
  const { ir, diagnostics } = compileLadder(project.ladder, project.tags);
  expect(diagnostics).toEqual([]);
  const rt = new PlcRuntime();
  rt.load(ir!);
  rt.start();
  const plant = PLANTS[example.plant!] as PlantModel<unknown>;
  let state = plant.initial();
  return {
    rt,
    get state() {
      return state as S;
    },
    command(name: string) {
      state = plant.command!(state, name);
    },
    run(ms: number, inputs: Record<string, boolean> = {}, each?: () => void) {
      for (const [a, v] of Object.entries(inputs)) rt.setInput(a, v);
      for (let t = 0; t < ms; t += rt.cycleTimeMs) {
        state = scanWithPlant(rt, plant, state);
        each?.();
      }
    },
  };
}

const q = (sim: { rt: PlcRuntime }, a: string) => sim.rt.getOutput(a);

describe('3 · reversing motor', () => {
  it('interlock: reverse is blocked while running forward; never a short circuit', () => {
    const sim = runExample<ReversingState>('reversing-motor');
    const both = () => expect(q(sim, 'Q0.0') && q(sim, 'Q0.1')).toBe(false);
    sim.run(20, { 'I0.2': true }, both);
    sim.run(50, { 'I0.0': true }, both);
    sim.run(1500, { 'I0.0': false }, both);
    expect(sim.state.speed).toBe(1);
    sim.run(100, { 'I0.1': true }, both); // reverse pressed while running
    expect(q(sim, 'Q0.1')).toBe(false);
    sim.run(50, { 'I0.1': false, 'I0.2': false }, both); // stop
    sim.run(2000, { 'I0.2': true }, both);
    sim.run(50, { 'I0.1': true }, both);
    sim.run(3000, { 'I0.1': false }, both);
    expect(sim.state.speed).toBe(-1);
    expect(sim.state.shortCircuit).toBe(false);
  });
});

describe('5 · automatic gate', () => {
  it('opens to the limit, closes to the limit, reopens on an obstacle, beacon flashes', () => {
    const sim = runExample<GateState>('automatic-gate');
    let flashes = 0;
    let last = false;
    const beacon = () => {
      const b = q(sim, 'Q0.2');
      if (b && !last) flashes++;
      last = b;
    };
    sim.run(50, { 'I0.0': true }, beacon);
    sim.run(9000, { 'I0.0': false }, beacon);
    expect(sim.state.position).toBe(100);
    expect(q(sim, 'Q0.0')).toBe(false);
    expect(flashes).toBeGreaterThanOrEqual(6);
    sim.run(50, { 'I0.1': true });
    sim.run(2000, { 'I0.1': false }); // closing, now around 75 %
    sim.command('toggleObstacle');
    sim.run(3000);
    expect(sim.state.hit).toBe(false);
    expect(sim.state.position).toBe(100); // reopened
    sim.command('toggleObstacle');
    sim.run(50, { 'I0.1': true });
    sim.run(9000, { 'I0.1': false });
    expect(sim.state.position).toBe(0);
    expect(GATE.carZone).toBeGreaterThan(0);
  });
});

describe('7 · star-delta', () => {
  it('star first, a pause, then delta; never star and delta together; lower peak', () => {
    const sim = runExample<StarDeltaState>('star-delta');
    let sawGap = false;
    sim.run(20, { 'I0.1': true });
    sim.run(50, { 'I0.0': true });
    expect(q(sim, 'Q0.0') && q(sim, 'Q0.1')).toBe(true);
    sim.run(8000, { 'I0.0': false }, () => {
      expect(q(sim, 'Q0.1') && q(sim, 'Q0.2')).toBe(false);
      if (q(sim, 'Q0.0') && !q(sim, 'Q0.1') && !q(sim, 'Q0.2')) sawGap = true;
    });
    expect(sawGap).toBe(true);
    expect(q(sim, 'Q0.2')).toBe(true);
    expect(sim.state.speed).toBeGreaterThan(0.95);
    expect(sim.state.shortCircuit).toBe(false);
    expect(sim.state.peak).toBeLessThan(4); // a direct delta start would reach 6×
  });
});

describe('8 · conveyor with box counter', () => {
  it('stops after a batch of 6 boxes and starts a new batch after reset', () => {
    const sim = runExample<ConveyorState>('conveyor-counter');
    sim.run(20, { 'I0.1': true });
    sim.run(50, { 'I0.0': true });
    sim.run(20_000, { 'I0.0': false });
    expect(sim.rt.read('C0.CV')).toBe(6);
    expect(q(sim, 'Q0.0')).toBe(false);
    expect(q(sim, 'Q0.1')).toBe(true);
    sim.run(50, { 'I0.3': true });
    sim.run(50, { 'I0.3': false, 'I0.0': true });
    sim.run(500, { 'I0.0': false });
    expect(q(sim, 'Q0.0')).toBe(true);
    expect(q(sim, 'Q0.1')).toBe(false);
  });
});

describe('9 · car park', () => {
  it('lets 10 cars in, shows FULL, and admits the next one when a car leaves', () => {
    const sim = runExample<ParkingState>('car-park');
    for (let k = 0; k < 12; k++) {
      sim.command('carArrives');
      sim.run(1600);
    }
    expect(sim.state.parked).toBe(10);
    expect(sim.state.waiting).toBe(2);
    expect(q(sim, 'Q0.0')).toBe(true);
    expect(q(sim, 'Q0.1')).toBe(false);
    sim.command('carLeaves');
    sim.run(3000);
    expect(sim.state.parked).toBe(10);
    expect(sim.state.waiting).toBe(1);
    expect(sim.rt.read('C0.CV')).toBe(10);
  });
});

describe('10 · sorting by size', () => {
  it('pushes every large part aside and lets small parts through', () => {
    const sim = runExample<SorterState>('size-sorter');
    sim.run(20, { 'I0.1': true });
    sim.run(50, { 'I0.0': true });
    sim.run(40_000, { 'I0.0': false });
    expect(sim.state.wrong).toBe(0);
    expect(sim.state.ok).toBeGreaterThan(15);
  });
});

describe('12 · two pumps', () => {
  it('alternates pumps between cycles and backs up a failed pump', () => {
    const sim = runExample<PumpsState>('two-pumps');
    sim.run(60_000, { 'I0.0': true });
    expect(sim.state.run1).toBeGreaterThan(5000);
    expect(sim.state.run2).toBeGreaterThan(5000);
    expect(sim.state.level).toBeGreaterThan(15);
    expect(q(sim, 'Q0.2')).toBe(false);
    sim.command('toggleFault1');
    const before = sim.state.run2;
    sim.run(40_000);
    expect(q(sim, 'Q0.2')).toBe(true);
    expect(q(sim, 'Q0.0')).toBe(false);
    expect(sim.state.run2).toBeGreaterThan(before + 5000); // pump 2 does all the work
    expect(sim.state.level).toBeGreaterThan(15);
  });
});

describe('13 · oven', () => {
  it('holds the temperature in the 175–185 °C band', () => {
    const sim = runExample<OvenState>('oven-temperature');
    sim.run(60_000, { 'I0.0': true });
    let min = 1000;
    let max = 0;
    sim.run(60_000, {}, () => {
      min = Math.min(min, sim.state.temp);
      max = Math.max(max, sim.state.temp);
    });
    expect(min).toBeGreaterThan(172);
    expect(max).toBeLessThan(188);
    sim.run(50, { 'I0.0': false });
    expect(q(sim, 'Q0.0')).toBe(false);
  });
});

describe('14 · analog level control', () => {
  it('settles below the setpoint (proportional offset) and closes the valve when off', () => {
    const sim = runExample<LevelControlState>('level-control');
    sim.run(120_000, { 'I0.0': true });
    // Kp = 8 → opening 8 %/% error; inflow 12 %/s × opening = 5 %/s → error ≈ 5.2 %.
    expect(sim.state.level).toBeGreaterThan(53.5);
    expect(sim.state.level).toBeLessThan(56);
    expect(sim.rt.getAnalogOutput('QW0')).toBeGreaterThan(0);
    sim.run(100, { 'I0.0': false });
    expect(sim.rt.getAnalogOutput('QW0')).toBe(0);
  });
});
