/**
 * Automatic grading of challenges (spec section 8). Pure TypeScript, no UI.
 *
 * A test case is a timeline on simulated time: `steps` set input terminals (and may act on the
 * plant) from a given moment on, and `expect` checks the physical outputs at given moments.
 * Each case runs on a fresh PLC, scan by scan, as fast as the CPU allows:
 *   for every scan starting at time t: apply the steps with at ≤ t → (plant sensors) → scan →
 *   (plant physics) → check the expectations with at ≤ t.
 * So a step and an expectation at the same time see one scan of reaction; authors leave some
 * margin around timer edges (e.g. expect OFF at 2.9 s and ON at 3.1 s for a 3 s TON).
 *
 * Analog channels: steps can set analog inputs (raw INT, IW0 = 0…27648) and expectations can
 * check an analog output inside a range ([min, max], raw value).
 */
import { PlcRuntime } from '@/simulator/engine';
import type { IrProgram } from '@/simulator/ir/types';
import type { LadderProgram, Series } from '@/simulator/languages/ladder/model';
import { applySensors, stepPlant } from '@/simulator/plants/coupling';
import type { PlantModel } from '@/simulator/plants/types';

export interface TestStep {
  at: number;
  /** Terminal values of inputs from this moment on. */
  inputs?: Record<string, boolean> | undefined;
  /** Operator action on the plant (e.g. "overload"). */
  plant?: string | undefined;
  /** Raw values of analog inputs from this moment on (IW0…). */
  analog?: Record<string, number> | undefined;
}

export interface TestExpectation {
  at: number;
  /** Expected physical outputs at that moment. */
  outputs: Record<string, boolean>;
  /** Expected analog outputs (QW0…): raw value within [min, max]. */
  analog?: Record<string, readonly [number, number]> | undefined;
}

export interface TestCase {
  steps: readonly TestStep[];
  expect: readonly TestExpectation[];
}

export interface ChallengeRules {
  cases: readonly TestCase[];
  /** Inputs that are 1 at rest (NC push buttons, NC overload contacts…). */
  restInputs?: readonly string[];
  /** Allowed Ladder instruction types, or null for all. */
  allowed: readonly string[] | null;
  plant: PlantModel | null;
}

export type CaseResult =
  | { passed: true }
  | {
      passed: false;
      reason: 'output';
      at: number;
      address: string;
      expected: boolean;
      actual: boolean;
    }
  | {
      passed: false;
      reason: 'analog';
      at: number;
      address: string;
      min: number;
      max: number;
      actual: number;
    }
  | { passed: false; reason: 'fault'; at: number };

export type Validation =
  /** The program has errors: it cannot be run. */
  | { status: 'invalid'; problem: 'errors' }
  /** The program uses instructions the challenge does not allow. */
  | { status: 'invalid'; problem: 'notAllowed'; types: string[] }
  /** The program has no output instruction at all. */
  | { status: 'invalid'; problem: 'empty' }
  | { status: 'passed' | 'failed'; cases: CaseResult[] };

/** Instruction types used by a Ladder program. */
export function usedTypes(program: LadderProgram): Set<string> {
  const types = new Set<string>();
  const walk = (s: Series): void => {
    for (const item of s.items) {
      if (item.kind === 'parallel') item.branches.forEach(walk);
      else types.add(item.type);
    }
  };
  for (const rung of program.rungs) {
    walk(rung.logic);
    rung.coils.forEach((c) => types.add(c.type));
  }
  return types;
}

export function validate(
  ir: IrProgram | null,
  program: LadderProgram,
  rules: ChallengeRules,
): Validation {
  if (!ir) return { status: 'invalid', problem: 'errors' };
  if (program.rungs.every((r) => r.coils.length === 0))
    return { status: 'invalid', problem: 'empty' };
  if (rules.allowed) {
    const allowed = new Set(rules.allowed);
    const extra = [...usedTypes(program)].filter((t) => !allowed.has(t));
    if (extra.length > 0) return { status: 'invalid', problem: 'notAllowed', types: extra };
  }
  const cases = rules.cases.map((c) => runCase(ir, c, rules));
  return { status: cases.every((c) => c.passed) ? 'passed' : 'failed', cases };
}

function runCase(ir: IrProgram, test: TestCase, rules: ChallengeRules): CaseResult {
  const rt = new PlcRuntime();
  rt.load(ir);
  rt.start();
  const plant = rules.plant;
  let state = plant?.initial();

  const inputs: Record<string, boolean> = {};
  const analog: Record<string, number> = {};
  for (const address of rules.restInputs ?? []) inputs[address] = true;
  const steps = [...test.steps].sort((a, b) => a.at - b.at);
  const expectations = [...test.expect].sort((a, b) => a.at - b.at);
  const end = expectations.at(-1)?.at ?? 0;
  let s = 0;
  let e = 0;

  while (e < expectations.length) {
    const now = rt.timeMs;
    for (; s < steps.length && steps[s]!.at <= now; s++) {
      const step = steps[s]!;
      Object.assign(inputs, step.inputs);
      Object.assign(analog, step.analog);
      if (plant?.command && step.plant) state = plant.command(state, step.plant);
    }
    for (const [address, value] of Object.entries(inputs)) rt.setInput(address, value);
    for (const [address, value] of Object.entries(analog)) rt.setAnalogInput(address, value);
    if (plant) applySensors(rt, plant, state);
    rt.scan();
    if (rt.mode !== 'RUN') return { passed: false, reason: 'fault', at: now };
    if (plant) state = stepPlant(rt, plant, state);

    for (; e < expectations.length && expectations[e]!.at <= now; e++) {
      for (const [address, expected] of Object.entries(expectations[e]!.outputs)) {
        const actual = rt.getOutput(address);
        if (actual !== expected) {
          return {
            passed: false,
            reason: 'output',
            at: expectations[e]!.at,
            address,
            expected,
            actual,
          };
        }
      }
      for (const [address, [min, max]] of Object.entries(expectations[e]!.analog ?? {})) {
        const actual = rt.getAnalogOutput(address);
        if (actual < min || actual > max) {
          return {
            passed: false,
            reason: 'analog',
            at: expectations[e]!.at,
            address,
            min,
            max,
            actual,
          };
        }
      }
    }
    if (now > end + rt.cycleTimeMs) break; // safety net
  }
  return { passed: true };
}
