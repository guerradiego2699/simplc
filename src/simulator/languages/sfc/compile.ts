/**
 * SFC → IR compiler. The chart becomes a Structured Text AST (compiled by the ST compiler), so
 * conditions and action variables resolve and type-check exactly like ST.
 *
 * Each step gets a BOOL marker (`.X`, from the top of M memory) and a TON instance that measures
 * the time in the step (`.T`). One scan of the chart:
 *   1. first scan: activate the initial step, deactivate the rest;
 *   2. evaluate every transition with the step states at the start (priority among transitions
 *      leaving the same step: list order);
 *   3. deactivate the source steps of the fired transitions and activate their targets;
 *   4. step timers;
 *   5. actions of the steps now active: N and P (pulse on activation) outputs are combined with
 *      OR into one assignment per variable; then S (set) and R (reset) in step order.
 *
 * So a step's actions take effect in the same scan the step becomes active.
 */
import type { Expression, Statement, StProgram, VarDecl, VarRef } from '../st/ast';
import { compileStProgram, type StSymbol } from '../st/compile';
import type { Range } from '../st/lexer';
import { createParser, ParseError, tokenizeOrThrow } from '../st/parser';
import type { IrProgram } from '@/simulator/ir/types';
import type { Tag } from '@/simulator/project/types';
import { STEP_NAME, type SfcProgram } from './model';

export const SFC_NETWORK_ID = 'sfc';

export type SfcDiagnosticCode =
  | 'SFC_NO_STEPS'
  | 'SFC_NO_INITIAL'
  | 'SFC_MANY_INITIAL'
  | 'SFC_BAD_STEP_NAME'
  | 'SFC_DUPLICATE_STEP'
  | 'SFC_UNKNOWN_STEP'
  | 'SFC_EMPTY_CONDITION'
  | 'SFC_EMPTY_ACTION'
  | 'SFC_UNREACHABLE'
  | 'SFC_MIXED_QUALIFIERS';

export interface SfcTarget {
  kind: 'step' | 'transition' | 'action' | 'program';
  /** Step, transition or action id (empty for the program). */
  id: string;
  /** For actions: their step. */
  stepId?: string;
}

export interface SfcDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  params: Record<string, string | number>;
  target: SfcTarget;
}

export interface SfcStepInfo {
  /** Address of the step flag (X). */
  x: string;
  /** Timer instance measuring the time in the step (its ET is `.T`). */
  timer: string;
}

export interface SfcCompileResult {
  ir: IrProgram | null;
  diagnostics: SfcDiagnostic[];
  symbols: StSymbol[];
  /** Addresses behind each step (by step id), for the live display. */
  steps: Record<string, SfcStepInfo>;
}

/** Probe holding the value of a transition condition. */
export const sfcProbe = (transitionId: string) => `sfc:${transitionId}`;

const STEP_TIME_PRESET = 'T#24h';

const ZERO: Range = { start: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 1, offset: 0 } };
/** A fresh range object: identity is what maps a compiler diagnostic back to an element. */
const fresh = (): Range => ({ start: { ...ZERO.start }, end: { ...ZERO.end } });

/** Every range object inside an expression. */
function collectRanges(e: Expression, into: (r: Range) => void): void {
  into(e.range);
  if (e.kind === 'unary') collectRanges(e.arg, into);
  else if (e.kind === 'binary') {
    collectRanges(e.left, into);
    collectRanges(e.right, into);
  } else if (e.kind === 'call') e.args.forEach((a) => collectRanges(a, into));
}

/** Parses a whole text as one expression (or a variable reference). */
function parseWhole<T>(text: string, read: (p: ReturnType<typeof createParser>) => T): T {
  const p = createParser(tokenizeOrThrow(text));
  const result = read(p);
  if (p.peek().kind !== 'eof') p.fail('end');
  return result;
}

export function compileSfc(program: SfcProgram, tags: readonly Tag[]): SfcCompileResult {
  const diagnostics: SfcDiagnostic[] = [];
  const owner = new Map<Range, SfcTarget>();
  const report = (
    code: SfcDiagnosticCode | string,
    target: SfcTarget,
    params: Record<string, string | number> = {},
    severity: 'error' | 'warning' = 'error',
  ) => diagnostics.push({ severity, code, params, target });
  const empty = (): SfcCompileResult => ({
    ir: null,
    diagnostics,
    symbols: compileStProgram({ vars: [], body: [] }, tags).symbols,
    steps: {},
  });
  const PROGRAM: SfcTarget = { kind: 'program', id: '' };

  // ------------------------------------------------------------------------ structure checks
  const { steps, transitions } = program;
  if (steps.length === 0) {
    report('SFC_NO_STEPS', PROGRAM);
    return empty();
  }
  const initials = steps.filter((s) => s.initial);
  if (initials.length === 0) report('SFC_NO_INITIAL', PROGRAM);
  if (initials.length > 1)
    for (const s of initials.slice(1)) report('SFC_MANY_INITIAL', { kind: 'step', id: s.id });
  const names = new Set<string>();
  for (const s of steps) {
    const target: SfcTarget = { kind: 'step', id: s.id };
    if (!STEP_NAME.test(s.name)) report('SFC_BAD_STEP_NAME', target, { name: s.name });
    else if (names.has(s.name.toUpperCase()))
      report('SFC_DUPLICATE_STEP', target, { name: s.name });
    names.add(s.name.toUpperCase());
  }
  const byId = new Map(steps.map((s) => [s.id, s]));
  for (const t of transitions) {
    if (!byId.has(t.from) || !byId.has(t.to))
      report('SFC_UNKNOWN_STEP', { kind: 'transition', id: t.id });
  }
  for (const s of steps) {
    if (!s.initial && !transitions.some((t) => t.to === s.id))
      report('SFC_UNREACHABLE', { kind: 'step', id: s.id }, { name: s.name }, 'warning');
  }
  if (diagnostics.some((d) => d.severity === 'error')) return empty();

  // ------------------------------------------------------------------- generated ST program
  const key = (name: string) => name.toUpperCase();
  const xName = (stepId: string) => `SFC_X_${key(byId.get(stepId)!.name)}`;
  const tName = (stepId: string) => `SFC_T_${key(byId.get(stepId)!.name)}`;
  const stepByName = new Map(steps.map((s) => [key(s.name), s]));

  const vars: VarDecl[] = [];
  const stepRange = new Map<string, Range>();
  for (const s of steps) {
    const range = fresh();
    owner.set(range, { kind: 'step', id: s.id });
    stepRange.set(s.id, range);
    vars.push(
      { name: xName(s.id), type: 'BOOL', range },
      { name: tName(s.id), type: 'TON', range },
    );
  }
  const v = (name: string, range: Range, member?: string): VarRef => ({
    kind: 'var',
    name,
    ...(member ? { member } : {}),
    range,
  });
  const bool = (value: boolean, range: Range): Expression => ({ kind: 'bool', value, range });
  const or = (list: Expression[], range: Range): Expression =>
    list.reduce((a, b) => ({ kind: 'binary', op: 'OR', left: a, right: b, range }));
  const and = (a: Expression, b: Expression, range: Range): Expression => ({
    kind: 'binary',
    op: 'AND',
    left: a,
    right: b,
    range,
  });
  const not = (arg: Expression, range: Range): Expression => ({
    kind: 'unary',
    op: 'NOT',
    arg,
    range,
  });

  /** `STEP.X` → step flag, `STEP.T` → its timer's elapsed time. Other names are left as they are. */
  const rewrite = (e: Expression): Expression => {
    switch (e.kind) {
      case 'var': {
        const step = stepByName.get(key(e.name));
        if (step && e.member === 'X')
          return { ...v(xName(step.id), e.range), ...(e.probe ? { probe: e.probe } : {}) };
        if (step && e.member === 'T') return v(tName(step.id), e.range, 'ET');
        return e;
      }
      case 'unary':
        return { ...e, arg: rewrite(e.arg) };
      case 'binary':
        return { ...e, left: rewrite(e.left), right: rewrite(e.right) };
      case 'call':
        return { ...e, args: e.args.map(rewrite) };
      default:
        return e;
    }
  };

  const body: Statement[] = [];
  const first = fresh();
  owner.set(first, PROGRAM);
  body.push({
    kind: 'if',
    branches: [
      {
        condition: v('S0.1', first),
        body: steps.map((s) => ({
          kind: 'assign' as const,
          target: v(xName(s.id), stepRange.get(s.id)!),
          value: bool(s.initial, stepRange.get(s.id)!),
          range: stepRange.get(s.id)!,
        })),
      },
    ],
    range: first,
  });

  // Transitions → fire flags.
  const fire = new Map<string, string>();
  let ok = true;
  transitions.forEach((t, index) => {
    const target: SfcTarget = { kind: 'transition', id: t.id };
    const range = fresh();
    owner.set(range, target);
    if (!t.condition.trim()) {
      report('SFC_EMPTY_CONDITION', target);
      ok = false;
      return;
    }
    let condition: Expression;
    try {
      condition = parseWhole(t.condition, (p) => p.expression());
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      report(e.code, target, e.params);
      ok = false;
      return;
    }
    collectRanges(condition, (r) => owner.set(r, target));
    condition = { ...rewrite(condition), probe: sfcProbe(t.id) };
    const name = `sfc_fire_${index}`;
    fire.set(t.id, name);
    let value = and(v(xName(t.from), range), condition, range);
    for (const earlier of transitions.slice(0, index)) {
      const f = fire.get(earlier.id);
      if (earlier.from === t.from && f)
        value = and(value, not({ kind: 'temp', name: f, range }, range), range);
    }
    body.push({ kind: 'let', name, value, range });
  });

  // Step evolution.
  for (const s of steps) {
    const range = stepRange.get(s.id)!;
    const temp = (t: { id: string }): Expression[] => {
      const f = fire.get(t.id);
      return f ? [{ kind: 'temp', name: f, range }] : [];
    };
    const outs = transitions.filter((t) => t.from === s.id).flatMap(temp);
    const ins = transitions.filter((t) => t.to === s.id).flatMap(temp);
    if (!outs.length && !ins.length) continue;
    let value: Expression = v(xName(s.id), range);
    if (outs.length) value = and(value, not(or(outs, range), range), range);
    if (ins.length) value = or([value, ...ins], range);
    body.push({ kind: 'assign', target: v(xName(s.id), range), value, range });
  }

  // Step timers.
  for (const s of steps) {
    const range = stepRange.get(s.id)!;
    body.push({
      kind: 'fbcall',
      name: tName(s.id),
      params: [
        { name: 'IN', value: v(xName(s.id), range), range },
        { name: 'PT', value: { kind: 'time', text: STEP_TIME_PRESET, range }, range },
      ],
      range,
    });
  }

  // Actions.
  type Parsed = { target: VarRef; range: Range; step: string; action: SfcTarget };
  const continuous = new Map<
    string,
    { target: VarRef; range: Range; terms: Expression[]; action: SfcTarget }
  >();
  const stored: { qualifier: 'S' | 'R'; parsed: Parsed }[] = [];
  const kinds = new Map<string, Set<string>>();
  for (const s of steps) {
    let pulse: Expression | null = null;
    for (const a of s.actions) {
      const target: SfcTarget = { kind: 'action', id: a.id, stepId: s.id };
      if (!a.variable.trim()) {
        report('SFC_EMPTY_ACTION', target);
        ok = false;
        continue;
      }
      let ref: VarRef;
      try {
        ref = parseWhole(a.variable, (p) => p.varRef());
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        report(e.code, target, e.params);
        ok = false;
        continue;
      }
      const range = fresh();
      owner.set(range, target);
      owner.set(ref.range, target);
      const k = key(a.variable.trim());
      kinds.set(
        k,
        new Set([
          ...(kinds.get(k) ?? []),
          a.qualifier === 'S' || a.qualifier === 'R' ? 'stored' : 'continuous',
        ]),
      );
      const x = v(xName(s.id), range);
      if (a.qualifier === 'N' || a.qualifier === 'P') {
        let term: Expression = x;
        if (a.qualifier === 'P') {
          if (!pulse) {
            const edge = `SFC_P_${key(s.name)}`;
            vars.push({ name: edge, type: 'R_TRIG', range: stepRange.get(s.id)! });
            body.push({
              kind: 'fbcall',
              name: edge,
              params: [{ name: 'CLK', value: v(xName(s.id), range), range }],
              range: stepRange.get(s.id)!,
            });
            pulse = v(edge, range, 'Q');
          }
          term = pulse;
        }
        const entry = continuous.get(k) ?? { target: ref, range, terms: [], action: target };
        entry.terms.push(term);
        continuous.set(k, entry);
      } else {
        stored.push({
          qualifier: a.qualifier,
          parsed: { target: ref, range, step: s.id, action: target },
        });
      }
    }
  }
  for (const [k, entry] of continuous) {
    if (kinds.get(k)?.size === 2)
      report('SFC_MIXED_QUALIFIERS', entry.action, { variable: entry.target.name }, 'warning');
    body.push({
      kind: 'assign',
      target: entry.target,
      value: or(entry.terms, entry.range),
      range: entry.range,
    });
  }
  for (const { qualifier, parsed } of stored) {
    body.push({
      kind: 'if',
      branches: [
        {
          condition: v(xName(parsed.step), parsed.range),
          body: [
            {
              kind: 'assign',
              target: parsed.target,
              value: bool(qualifier === 'S', parsed.range),
              range: parsed.range,
            },
          ],
        },
      ],
      range: parsed.range,
    });
  }

  const st: StProgram = { name: 'SFC', vars, body };
  const result = compileStProgram(st, tags, { id: SFC_NETWORK_ID, label: 'SFC' });
  for (const d of result.diagnostics) {
    diagnostics.push({
      severity: d.severity,
      code: d.code,
      params: d.params,
      target: owner.get(d.range) ?? PROGRAM,
    });
  }

  const address = (name: string) =>
    result.symbols.find((sym) => sym.origin === 'local' && key(sym.name) === key(name))?.address ??
    '';
  const stepInfo: Record<string, SfcStepInfo> = {};
  for (const s of steps) stepInfo[s.id] = { x: address(xName(s.id)), timer: address(tName(s.id)) };

  const hasErrors = !ok || diagnostics.some((d) => d.severity === 'error');
  return {
    ir: hasErrors ? null : result.ir,
    diagnostics: dedupe(diagnostics),
    // Internal SFC_ locals stay out of completion lists.
    symbols: result.symbols.filter((sym) => !(sym.origin === 'local' && /^SFC_/i.test(sym.name))),
    steps: stepInfo,
  };
}

function dedupe(list: SfcDiagnostic[]): SfcDiagnostic[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = `${d.code}|${d.target.kind}|${d.target.id}|${JSON.stringify(d.params)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
