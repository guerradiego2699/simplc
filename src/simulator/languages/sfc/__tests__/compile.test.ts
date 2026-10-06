import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { tag } from '@/simulator/project/tags';
import { compileSfc, sfcProbe } from '../compile';
import {
  addAction,
  addStepAfter,
  moveTransition,
  removeStep,
  renameStep,
  sfcStep,
  sfcTransition,
  starterSfc,
  type SfcProgram,
} from '../model';

const TAGS = [tag('MARCHA', 'I0.0'), tag('LISTO', 'I0.1'), tag('MOTOR', 'Q0.0')];

function chart(): SfcProgram {
  const idle = sfcStep('REPOSO', [{ qualifier: 'N', variable: 'Q0.3' }], true);
  const run = sfcStep('MARCHA_MOTOR', [
    { qualifier: 'N', variable: 'MOTOR' },
    { qualifier: 'S', variable: 'Q0.1' },
    { qualifier: 'P', variable: 'Q0.2' },
  ]);
  const wait = sfcStep('ESPERA', [{ qualifier: 'R', variable: 'Q0.1' }]);
  return {
    steps: [idle, run, wait],
    transitions: [
      sfcTransition(idle.id, run.id, 'MARCHA'),
      sfcTransition(run.id, wait.id, 'LISTO'),
      sfcTransition(run.id, idle.id, 'NOT MARCHA'),
      sfcTransition(wait.id, idle.id, 'ESPERA.T >= T#200ms'),
    ],
  };
}

function run(program: SfcProgram) {
  const result = compileSfc(program, TAGS);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const rt = new PlcRuntime({ trace: true });
  rt.load(result.ir!);
  rt.start();
  const active = () =>
    program.steps.filter((s) => rt.read(result.steps[s.id]!.x) === true).map((s) => s.name);
  return { rt, active, result };
}

describe('SFC execution', () => {
  it('starts in the initial step and follows transitions; actions N, S, P, R', () => {
    const program = chart();
    const { rt, active } = run(program);
    rt.scan();
    expect(active()).toEqual(['REPOSO']);
    expect(rt.getOutput('Q0.3')).toBe(true);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(active()).toEqual(['MARCHA_MOTOR']);
    expect(rt.getOutput('Q0.0')).toBe(true); // N, same scan
    expect(rt.getOutput('Q0.1')).toBe(true); // S
    expect(rt.getOutput('Q0.2')).toBe(true); // P: first scan only
    expect(rt.getOutput('Q0.3')).toBe(false);
    rt.scan();
    expect(rt.getOutput('Q0.2')).toBe(false);
    expect(rt.getOutput('Q0.1')).toBe(true);
    rt.setInput('I0.0', false);
    rt.setInput('I0.1', true); // LISTO has priority over NOT MARCHA
    rt.scan();
    expect(active()).toEqual(['ESPERA']);
    expect(rt.getOutput('Q0.0')).toBe(false);
    expect(rt.getOutput('Q0.1')).toBe(false); // R
    rt.setInput('I0.1', false);
    rt.advance(150);
    expect(active()).toEqual(['ESPERA']);
    rt.advance(100);
    expect(active()).toEqual(['REPOSO']);
  });

  it('selection branch: the first transition in the list has priority', () => {
    const program = chart();
    const { rt, active } = run(program);
    rt.setInput('I0.0', true);
    rt.scan();
    // Both LISTO and NOT MARCHA true: LISTO (listed first) wins.
    rt.setInput('I0.0', false);
    rt.setInput('I0.1', true);
    rt.scan();
    expect(active()).toEqual(['ESPERA']);

    const swapped = moveTransition(program, program.transitions[2]!.id, -1);
    const second = run(swapped);
    second.rt.setInput('I0.0', true);
    second.rt.scan();
    second.rt.setInput('I0.0', false);
    second.rt.setInput('I0.1', true);
    second.rt.scan();
    expect(second.active()).toEqual(['REPOSO']);
  });

  it('records transition conditions as probes and step activity is readable as STEP.X', () => {
    const program = chart();
    program.steps[0]!.actions.push({ id: 'a', qualifier: 'N', variable: 'Q0.4' });
    program.transitions[0]!.condition = 'MARCHA AND REPOSO.X';
    const { rt } = run(program);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.probes.get(sfcProbe(program.transitions[0]!.id))).toBe(true);
  });
});

describe('SFC diagnostics', () => {
  const codes = (p: SfcProgram) => compileSfc(p, TAGS).diagnostics.map((d) => d.code);

  it('structure errors', () => {
    expect(codes({ steps: [], transitions: [] })).toEqual(['SFC_NO_STEPS']);
    const p = chart();
    expect(codes({ ...p, steps: p.steps.map((s) => ({ ...s, initial: false })) })).toContain(
      'SFC_NO_INITIAL',
    );
    expect(codes({ ...p, steps: p.steps.map((s) => ({ ...s, initial: true })) })).toContain(
      'SFC_MANY_INITIAL',
    );
    expect(codes(renameStep(p, p.steps[1]!.id, 'REPOSO'))).toContain('SFC_DUPLICATE_STEP');
    expect(codes(renameStep(p, p.steps[1]!.id, '1X'))).toContain('SFC_BAD_STEP_NAME');
  });

  it('condition and action errors point at their element', () => {
    const p = chart();
    p.transitions[0]!.condition = 'MARCHA AND';
    p.transitions[1]!.condition = 'NADA';
    const list = compileSfc(p, TAGS).diagnostics;
    expect(list.find((d) => d.code === 'ST_SYNTAX')?.target.id).toBe(p.transitions[0]!.id);
    expect(list.find((d) => d.code === 'ST_UNKNOWN_NAME')?.target.id).toBe(p.transitions[1]!.id);

    const q = chart();
    q.transitions[0]!.condition = 'MW0';
    q.steps[1]!.actions[0]!.variable = 'MW2';
    const typed = compileSfc(q, TAGS).diagnostics.filter((d) => d.code === 'TYPE_MISMATCH');
    expect(typed.map((d) => d.target.kind).sort()).toEqual(['action', 'transition']);
  });

  it('warns about unreachable steps and mixed qualifiers', () => {
    const p = chart();
    const extra = sfcStep('SUELTA', [{ qualifier: 'N', variable: 'Q0.1' }]);
    p.steps.push(extra);
    const list = compileSfc(p, TAGS).diagnostics;
    expect(
      list
        .filter((d) => d.severity === 'warning')
        .map((d) => d.code)
        .sort(),
    ).toEqual(['SFC_MIXED_QUALIFIERS', 'SFC_UNREACHABLE']);
  });
});

describe('SFC model operations', () => {
  it('add / remove steps keep one initial step and drop dangling transitions', () => {
    const start = starterSfc();
    const { program, step } = addStepAfter(start, start.steps[1]!.id);
    expect(program.steps.map((s) => s.name)).toEqual(['S0', 'S1', 'S2']);
    expect(program.transitions.at(-1)).toMatchObject({ from: start.steps[1]!.id, to: step.id });
    const removed = removeStep(program, program.steps[0]!.id);
    expect(removed.steps[0]!.initial).toBe(true);
    expect(removed.transitions.every((t) => t.from !== start.steps[0]!.id)).toBe(true);
    expect(addAction(removed, step.id, 'Q0.0').steps[1]!.actions[0]!.qualifier).toBe('N');
  });

  it('renaming a step updates STEP.X / STEP.T in conditions', () => {
    const p = chart();
    const renamed = renameStep(p, p.steps[2]!.id, 'PAUSA');
    expect(renamed.transitions[3]!.condition).toBe('PAUSA.T >= T#200ms');
  });

  it('the starter chart compiles', () => {
    expect(compileSfc(starterSfc(), []).diagnostics).toEqual([]);
  });
});
