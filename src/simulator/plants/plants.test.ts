import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { EXAMPLES, exampleProject, getExample } from '@/simulator/examples';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import { compileProject, diagnosticCounts } from '@/simulator/project/compile-project';
import { scanWithPlant } from './coupling';
import { motorPlant, PLANTS, tankPlant, TANK } from './models';
import type { PlantIo, PlantModel } from './types';

const ON: PlantIo = { bit: () => true, word: () => 0 };

/** Loads an example, starts the PLC and returns a helper to run it coupled to its plant. */
function runExample(id: string) {
  const example = getExample(id)!;
  const project = exampleProject(example, 'es');
  const { ir, diagnostics } = compileLadder(project.ladder, project.tags);
  expect(diagnostics).toEqual([]); // examples must be clean: no errors, no warnings
  const rt = new PlcRuntime();
  rt.load(ir!);
  rt.start();
  const plant = PLANTS[example.plant!] as PlantModel<unknown>;
  let state = plant.initial();
  return {
    rt,
    get state() {
      return state;
    },
    command(name: string) {
      state = plant.command!(state, name);
    },
    /** Runs `ms` of simulated time scan by scan. */
    run(ms: number, inputs: Record<string, boolean> = {}) {
      for (const [a, v] of Object.entries(inputs)) rt.setInput(a, v);
      for (let t = 0; t < ms; t += rt.cycleTimeMs) state = scanWithPlant(rt, plant, state);
    },
  };
}

describe('examples', () => {
  it('the examples follow the spec order (all 14)', () => {
    expect(EXAMPLES.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('every example builds a clean project in both languages', () => {
    for (const example of EXAMPLES) {
      for (const locale of ['es', 'en'] as const) {
        const p = exampleProject(example, locale);
        expect(p.name).toBe(example.title[locale]);
        expect(p.plant).toBe(example.plant);
        // In its own language (Ladder, or SFC for the batch mixer): no errors, no warnings.
        expect(diagnosticCounts(compileProject(p))).toEqual({ errors: 0, warnings: 0 });
        expect(example.steps[locale].length).toBeGreaterThan(0);
      }
    }
  });

  it('uses localized tag names and panel labels', () => {
    const es = exampleProject(getExample('motor-start-stop')!, 'es');
    const en = exampleProject(getExample('motor-start-stop')!, 'en');
    expect(es.tags.map((t) => t.name)).toContain('MARCHA');
    expect(en.tags.map((t) => t.name)).toContain('START');
    expect(es.io.inputs['I0.1']).toEqual({ label: 'PARO', mode: 'button-nc' });
  });
});

describe('lamp example', () => {
  it('the lamp follows the switch', () => {
    const sim = runExample('lamp-switch');
    sim.run(20, { 'I0.0': true });
    expect(sim.rt.getOutput('Q0.0')).toBe(true);
    sim.run(20, { 'I0.0': false });
    expect(sim.rt.getOutput('Q0.0')).toBe(false);
  });
});

describe('motor example and plant', () => {
  it('starts, seals in, accelerates, and stops with STOP', () => {
    const sim = runExample('motor-start-stop');
    sim.run(20, { 'I0.1': true }); // NC stop at rest
    sim.run(50, { 'I0.0': true });
    sim.run(1000, { 'I0.0': false });
    expect(sim.rt.getOutput('Q0.0')).toBe(true);
    expect((sim.state as { speed: number }).speed).toBe(1);
    sim.run(50, { 'I0.1': false });
    expect(sim.rt.getOutput('Q0.0')).toBe(false);
    sim.run(500);
    expect((sim.state as { speed: number }).speed).toBeLessThan(1);
  });

  it('an overload trips the relay, stops the motor and blocks restarting until reset', () => {
    const sim = runExample('motor-start-stop');
    sim.run(20, { 'I0.1': true });
    sim.run(50, { 'I0.0': true });
    sim.run(50, { 'I0.0': false });
    sim.command('overload');
    sim.run(50);
    expect(sim.rt.read('I0.2')).toBe(false);
    expect(sim.rt.getOutput('Q0.0')).toBe(false);
    sim.run(50, { 'I0.0': true });
    expect(sim.rt.getOutput('Q0.0')).toBe(false); // cannot restart
    sim.command('resetOverload');
    sim.run(50);
    expect(sim.rt.getOutput('Q0.0')).toBe(true); // START still held
  });

  it('motor physics: accelerates only while powered and not tripped', () => {
    let s = motorPlant.initial();
    s = motorPlant.step(s, 500, ON);
    expect(s.speed).toBeCloseTo(0.75);
    s = motorPlant.command!(s, 'overload');
    s = motorPlant.step(s, 500, ON);
    expect(s.speed).toBeCloseTo(0.35);
  });
});

describe('traffic light example', () => {
  const lights = (sim: ReturnType<typeof runExample>) =>
    ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'Q0.4', 'Q0.5']
      .map((a) => (sim.rt.getOutput(a) ? 1 : 0))
      .join('');

  it('runs the 20 s sequence and never shows two greens', () => {
    const sim = runExample('traffic-light');
    const seen = new Set<string>();
    sim.run(20, { 'I0.0': true });
    for (let t = 0; t < 45_000; t += 100) {
      sim.run(100);
      const l = lights(sim);
      seen.add(l);
      expect(l[2] === '1' && l[5] === '1').toBe(false); // green A and green B
      expect(l[0] === '1' && l[3] === '1').toBe(false); // red A and red B
    }
    // A green / B red, A amber / B red, A red / B green, A red / B amber
    expect([...seen].sort()).toEqual(['001100', '010100', '100001', '100010']);
  });

  it('everything is off when the ON switch is off', () => {
    const sim = runExample('traffic-light');
    sim.run(500, { 'I0.0': false });
    expect(lights(sim)).toBe('000000');
  });
});

describe('tank example and plant', () => {
  it('keeps the level between the two switches (hysteresis)', () => {
    const sim = runExample('tank-filling');
    sim.run(20, { 'I0.0': true });
    let min = 100;
    let max = 0;
    for (let t = 0; t < 60_000; t += 100) {
      sim.run(100);
      const level = (sim.state as { level: number }).level;
      if (t > 10_000) {
        min = Math.min(min, level);
        max = Math.max(max, level);
      }
    }
    expect(max).toBeLessThanOrEqual(TANK.high + 1);
    expect(min).toBeGreaterThanOrEqual(TANK.low - 1);
    expect(max - min).toBeGreaterThan(50); // it really cycles between both marks
  });

  it('tank physics: fills with the pump, drains with consumption, clamps to 0–100 %', () => {
    let s = tankPlant.initial();
    s = tankPlant.step(s, 1000, ON);
    expect(s.level).toBeCloseTo(10 + TANK.inflowPerS - TANK.outflowPerS);
    s = tankPlant.command!(s, 'toggleConsumption');
    s = tankPlant.step(s, 20_000, ON);
    expect(s.level).toBe(100);
    expect(tankPlant.read(s)).toEqual({ 'I0.2': true, 'I0.3': true });
  });
});
