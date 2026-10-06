/**
 * Sequential Function Chart (SFC, IEC 61131-3) program model.
 *
 * - Steps are listed in order (that is how they are drawn, top to bottom). Exactly one is the
 *   initial step.
 * - A transition goes from one step to another when its condition (a BOOL expression written as
 *   in ST) is TRUE. A step with several outgoing transitions is a selection branch: the first
 *   one in the list wins (priority). Jumps to any step (also backwards, to repeat the cycle) are
 *   allowed. Parallel branches (several active steps) are not part of this model.
 * - Each step has action associations: qualifier + BOOL variable. N = on while the step is
 *   active, S = set (stays on), R = reset, P = pulse (one scan when the step becomes active).
 *   Conditions can read `STEP.X` (step active) and `STEP.T` (time in the step, TIME).
 *
 * All operations are pure: they return a new program and never mutate their input.
 */
import { newId } from '@/simulator/languages/ladder/model';

export const SFC_QUALIFIERS = ['N', 'S', 'R', 'P'] as const;
export type SfcQualifier = (typeof SFC_QUALIFIERS)[number];

export interface SfcAction {
  id: string;
  qualifier: SfcQualifier;
  /** BOOL variable or address the action drives ("MOTOR", "Q0.0"). */
  variable: string;
}

export interface SfcStep {
  id: string;
  /** Identifier used in conditions (`LLENAR.T`). */
  name: string;
  initial: boolean;
  comment: string;
  actions: SfcAction[];
}

export interface SfcTransition {
  id: string;
  from: string;
  to: string;
  /** BOOL expression in ST syntax ("NIVEL_ALTO AND NOT PARO", "MEZCLAR.T >= T#5s"). */
  condition: string;
}

export interface SfcProgram {
  steps: SfcStep[];
  transitions: SfcTransition[];
}

export const STEP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const sfcStep = (
  name: string,
  actions: Omit<SfcAction, 'id'>[] = [],
  initial = false,
  comment = '',
): SfcStep => ({
  id: newId('step'),
  name,
  initial,
  comment,
  actions: actions.map((a) => ({ id: newId('act'), ...a })),
});

export const sfcTransition = (from: string, to: string, condition: string): SfcTransition => ({
  id: newId('tr'),
  from,
  to,
  condition,
});

/** A new SFC program: an initial step that waits and a step that returns to it. */
export function starterSfc(): SfcProgram {
  const s0 = sfcStep('S0', [], true);
  const s1 = sfcStep('S1');
  return {
    steps: [s0, s1],
    transitions: [sfcTransition(s0.id, s1.id, 'I0.0'), sfcTransition(s1.id, s0.id, 'NOT I0.0')],
  };
}

/** First free step name "S<n>". */
export function nextStepName(program: SfcProgram): string {
  const used = new Set(program.steps.map((s) => s.name.toUpperCase()));
  let n = program.steps.length;
  while (used.has(`S${n}`)) n++;
  return `S${n}`;
}

export const outgoing = (program: SfcProgram, stepId: string) =>
  program.transitions.filter((t) => t.from === stepId);

/**
 * Adds a step after `afterId` (or at the end) plus a transition into it from that step.
 * The new transition's condition is FALSE, so nothing changes until the user writes it.
 */
export function addStepAfter(
  program: SfcProgram,
  afterId: string | null,
): { program: SfcProgram; step: SfcStep } {
  const step = sfcStep(nextStepName(program));
  const index = afterId ? program.steps.findIndex((s) => s.id === afterId) : -1;
  const at = index >= 0 ? index + 1 : program.steps.length;
  const from = index >= 0 ? program.steps[index] : program.steps[program.steps.length - 1];
  const steps = [...program.steps.slice(0, at), step, ...program.steps.slice(at)];
  if (steps.length === 1) step.initial = true;
  return {
    program: {
      steps,
      transitions: from
        ? [...program.transitions, sfcTransition(from.id, step.id, 'FALSE')]
        : program.transitions,
    },
    step,
  };
}

export function removeStep(program: SfcProgram, id: string): SfcProgram {
  const steps = program.steps.filter((s) => s.id !== id);
  if (steps.length && !steps.some((s) => s.initial)) {
    steps[0] = { ...steps[0]!, initial: true };
  }
  return {
    steps,
    transitions: program.transitions.filter((t) => t.from !== id && t.to !== id),
  };
}

export function updateStep(program: SfcProgram, id: string, patch: Partial<SfcStep>): SfcProgram {
  return { ...program, steps: program.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

/** Makes `id` the only initial step. */
export function setInitial(program: SfcProgram, id: string): SfcProgram {
  return { ...program, steps: program.steps.map((s) => ({ ...s, initial: s.id === id })) };
}

/** Moves a step up (-1) or down (+1) in the drawing order. */
export function moveStep(program: SfcProgram, id: string, delta: -1 | 1): SfcProgram {
  const index = program.steps.findIndex((s) => s.id === id);
  const to = index + delta;
  if (index < 0 || to < 0 || to >= program.steps.length) return program;
  const steps = [...program.steps];
  [steps[index], steps[to]] = [steps[to]!, steps[index]!];
  return { ...program, steps };
}

export function addTransition(
  program: SfcProgram,
  from: string,
  to: string,
): { program: SfcProgram; transition: SfcTransition } {
  const transition = sfcTransition(from, to, 'FALSE');
  return { program: { ...program, transitions: [...program.transitions, transition] }, transition };
}

export function removeTransition(program: SfcProgram, id: string): SfcProgram {
  return { ...program, transitions: program.transitions.filter((t) => t.id !== id) };
}

export function updateTransition(
  program: SfcProgram,
  id: string,
  patch: Partial<Omit<SfcTransition, 'id' | 'from'>>,
): SfcProgram {
  return {
    ...program,
    transitions: program.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

/** Raises (-1) or lowers (+1) a transition's priority among those leaving the same step. */
export function moveTransition(program: SfcProgram, id: string, delta: -1 | 1): SfcProgram {
  const t = program.transitions.find((x) => x.id === id);
  if (!t) return program;
  const siblings = program.transitions.filter((x) => x.from === t.from);
  const k = siblings.indexOf(t);
  const other = siblings[k + delta];
  if (!other) return program;
  const transitions = [...program.transitions];
  const a = transitions.indexOf(t);
  const b = transitions.indexOf(other);
  [transitions[a], transitions[b]] = [other, t];
  return { ...program, transitions };
}

export function addAction(program: SfcProgram, stepId: string, variable = ''): SfcProgram {
  return {
    ...program,
    steps: program.steps.map((s) =>
      s.id === stepId
        ? { ...s, actions: [...s.actions, { id: newId('act'), qualifier: 'N', variable }] }
        : s,
    ),
  };
}

export function updateAction(
  program: SfcProgram,
  stepId: string,
  actionId: string,
  patch: Partial<Omit<SfcAction, 'id'>>,
): SfcProgram {
  return {
    ...program,
    steps: program.steps.map((s) =>
      s.id === stepId
        ? { ...s, actions: s.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }
        : s,
    ),
  };
}

export function removeAction(program: SfcProgram, stepId: string, actionId: string): SfcProgram {
  return {
    ...program,
    steps: program.steps.map((s) =>
      s.id === stepId ? { ...s, actions: s.actions.filter((a) => a.id !== actionId) } : s,
    ),
  };
}

/** Renames a step and updates `OLD.X` / `OLD.T` references in transition conditions. */
export function renameStep(program: SfcProgram, id: string, name: string): SfcProgram {
  const step = program.steps.find((s) => s.id === id);
  if (!step) return program;
  const old = step.name;
  const pattern = new RegExp(`\\b${old.replace(/[^\w]/g, '')}\\.(X|T)\\b`, 'gi');
  const renamed = updateStep(program, id, { name });
  if (!STEP_NAME.test(old) || !STEP_NAME.test(name)) return renamed;
  return {
    ...renamed,
    transitions: renamed.transitions.map((t) => ({
      ...t,
      condition: t.condition.replace(
        pattern,
        (_m, member: string) => `${name}.${member.toUpperCase()}`,
      ),
    })),
  };
}
