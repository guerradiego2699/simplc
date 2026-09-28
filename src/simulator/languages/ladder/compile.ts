/**
 * Ladder → IR compiler.
 *
 * Every rung becomes one IR network. The power flow is compiled as straight-line temporaries,
 * one per element, so each contact (and each edge detector) is evaluated exactly once per scan
 * even when its result feeds several parallel branches or coils:
 *
 *   let s_<id> = <contact condition>          probe "<id>:state"  (contact closed?)
 *   let p_<id> = p_<prev> AND s_<id>          probe "<id>"        (power after the contact)
 *   let p_<par> = p_<branch1> OR p_<branch2>  probe "<par>"       (power after a parallel block)
 *   Q := p_<last>                             probe "<coil id>"
 *
 * Timer and counter boxes emit their call with the rung power as IN/CU and pass their Q on as
 * power. Output boxes (MOVE, ADD…, SCALE) run inside IF <rung power> (their EN input).
 *
 * The editor colours wires and symbols from these probes (power flow in RUN).
 */
import { analyze, type Diagnostic as EngineDiagnostic } from '@/simulator/engine';
import { parseLiteral } from '@/simulator/engine';
import {
  add,
  and,
  arith,
  cmp,
  convert,
  counterCall,
  div,
  FALSE,
  falling,
  if_,
  let_,
  mul,
  network,
  not,
  or,
  program as irProgram,
  read,
  rising,
  sub,
  temp,
  timerCall,
  TRUE,
} from '@/simulator/ir/builders';
import type {
  ArithOp,
  CompareOp,
  CounterStmt,
  Expr,
  IrProgram,
  Stmt,
  TimerStmt,
} from '@/simulator/ir/types';
import { resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import { spec } from './catalog';
import type { Coil, Contact, LadderProgram, Rung, Series } from './model';

/** Probe id of the power at the left rail (always TRUE while running). */
export const RAIL = 'rail';
export const stateProbe = (contactId: string) => `${contactId}:state`;

export type LadderDiagnosticCode =
  | EngineDiagnostic['code']
  | 'MISSING_OPERAND'
  | 'MISSING_PARAM'
  | 'UNKNOWN_SYMBOL'
  | 'RUNG_WITHOUT_OUTPUT'
  | 'EMPTY_BRANCH';

export interface LadderDiagnostic {
  severity: 'error' | 'warning';
  code: LadderDiagnosticCode;
  params: Record<string, string | number>;
  rungId?: string;
  elementId?: string;
}

export interface LadderCompileResult {
  /** Null when there are errors. */
  ir: IrProgram | null;
  diagnostics: LadderDiagnostic[];
}

interface Power {
  /** Probe id carrying this power value (element id, parallel id or RAIL). */
  ref: string;
  expr: Expr;
}

export function compileLadder(program: LadderProgram, tags: readonly Tag[]): LadderCompileResult {
  const diagnostics: LadderDiagnostic[] = [];
  const networks = program.rungs.map((r) => compileRung(r, tags, diagnostics));
  const ir = irProgram(...networks);

  // Engine-level checks (addresses, duplicate coils, read-only targets…), mapped back to elements.
  for (const d of analyze(ir)) {
    diagnostics.push({
      severity: d.severity,
      code: d.code,
      params: d.params,
      ...(d.networkId ? { rungId: d.networkId } : {}),
      ...(d.source ? { elementId: d.source } : {}),
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return { ir: hasErrors ? null : ir, diagnostics: dedupe(diagnostics) };
}

function compileRung(r: Rung, tags: readonly Tag[], diagnostics: LadderDiagnostic[]) {
  const body: Stmt[] = [];

  const report = (elementId: string, code: LadderDiagnosticCode, params: Record<string, string>) =>
    diagnostics.push({ severity: 'error', code, params, rungId: r.id, elementId });

  /** Operand text of the main operand or of a param. */
  const textOf = (el: Contact | Coil, key: string) =>
    (key === 'operand' ? el.operand : (el.params?.[key] ?? '')).trim();

  /** Resolves an operand that must be an address (bit to read/write, word target, instance). */
  const address = (el: Contact | Coil, key: string, optional = false): string | null => {
    const text = textOf(el, key);
    if (text === '' && optional) return null;
    const res = resolveOperand(text, tags);
    if (res.ok) return res.address;
    if (res.problem === 'MISSING_OPERAND') {
      report(el.id, key === 'operand' ? 'MISSING_OPERAND' : 'MISSING_PARAM', { param: key });
    } else {
      report(el.id, 'UNKNOWN_SYMBOL', { operand: text });
    }
    return null;
  };

  /** Resolves an operand that is a value: a literal (5, 1.5, T#2s) or an address/tag. */
  const value = (el: Contact | Coil, key: string): Expr | null => {
    const text = textOf(el, key);
    const literal = parseLiteral(text);
    if (literal) return { kind: 'const', value: literal.value, type: literal.type, source: el.id };
    const a = address(el, key);
    return a ? { ...read(a), source: el.id } : null;
  };

  const optionalBit = (el: Contact | Coil, key: string): Expr | undefined => {
    const a = address(el, key, true);
    return a ? { ...read(a), source: el.id } : undefined;
  };

  /** Emits the statements of one logic element and returns the power after it. */
  const logicElement = (c: Contact, power: Power): Power => {
    const info = spec(c.type);
    const stateName = `s_${c.id}`;
    const powerName = `p_${c.id}`;
    const meta = { source: c.id };
    let state: Expr = FALSE;
    let passesPower = true; // contacts/compare: power AND state; boxes: power = their Q

    switch (info.family) {
      case 'contact': {
        const a = address(c, 'operand');
        if (a) {
          const bit: Expr = { ...read(a), source: c.id };
          state =
            c.type === 'NC'
              ? not(bit)
              : c.type === 'P'
                ? { ...rising(bit, c.id), source: c.id }
                : c.type === 'N'
                  ? { ...falling(bit, c.id), source: c.id }
                  : bit;
        }
        break;
      }
      case 'compare': {
        const left = value(c, 'operand');
        const right = value(c, 'in2');
        if (left && right)
          state = { ...cmp(COMPARE_OPS[c.type] ?? '=', left, right), source: c.id };
        break;
      }
      case 'timer': {
        passesPower = false;
        const instance = address(c, 'operand');
        const preset = value(c, 'pt');
        if (instance && preset) {
          body.push({
            ...timerCall(c.type as TimerStmt['type'], instance, power.expr, preset),
            ...meta,
          });
          state = read(instance);
        }
        break;
      }
      case 'counter': {
        passesPower = false;
        const instance = address(c, 'operand');
        const preset = value(c, 'pv');
        const reset = optionalBit(c, 'r');
        const load = optionalBit(c, 'ld');
        const down = c.type === 'CTUD' ? optionalBit(c, 'cd') : undefined;
        if (c.type === 'CTUD' && !down) address(c, 'cd'); // required: report it
        if (instance && preset) {
          const pins =
            c.type === 'CTU'
              ? { up: power.expr, ...(reset ? { reset } : {}) }
              : c.type === 'CTD'
                ? { down: power.expr, ...(load ? { load } : {}) }
                : {
                    up: power.expr,
                    ...(down ? { down } : {}),
                    ...(reset ? { reset } : {}),
                    ...(load ? { load } : {}),
                  };
          body.push({
            ...counterCall(c.type as CounterStmt['type'], instance, { ...pins, preset }),
            ...meta,
          });
          state = read(instance);
        }
        break;
      }
      default:
        break;
    }

    body.push({ ...let_(stateName, state), probe: stateProbe(c.id) });
    body.push({
      ...let_(powerName, passesPower ? and(power.expr, temp(stateName)) : temp(stateName)),
      probe: c.id,
    });
    return { ref: c.id, expr: temp(powerName) };
  };

  const compileSeries = (s: Series, input: Power, isBranch: boolean): Power => {
    if (isBranch && s.items.length === 0) {
      diagnostics.push({ severity: 'warning', code: 'EMPTY_BRANCH', params: {}, rungId: r.id });
    }
    let power = input;
    for (const item of s.items) {
      if (item.kind === 'contact') {
        power = logicElement(item, power);
      } else {
        const outs = item.branches.map((b) => compileSeries(b, power, true));
        const powerName = `p_${item.id}`;
        body.push({ ...let_(powerName, or(...outs.map((o) => o.expr))), probe: item.id });
        power = { ref: item.id, expr: temp(powerName) };
      }
    }
    return power;
  };

  const out = compileSeries(r.logic, { ref: RAIL, expr: TRUE }, false);

  if (r.coils.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'RUNG_WITHOUT_OUTPUT',
      params: {},
      rungId: r.id,
    });
  }

  for (const c of r.coils) {
    const target = address(c, 'operand');
    const meta = { source: c.id, probe: c.id };
    switch (c.type) {
      case 'coil':
      case 'negated':
      case 'set':
      case 'reset': {
        if (!target) break;
        if (c.type === 'coil') body.push({ kind: 'assign', target, value: out.expr, ...meta });
        else if (c.type === 'negated')
          body.push({ kind: 'assign', target, value: not(out.expr), ...meta });
        else body.push({ kind: c.type, target, condition: out.expr, ...meta });
        break;
      }
      default: {
        // Boxes execute only while the rung conducts (EN); their output power is EN.
        const result = boxValue(c, value);
        if (target && result) {
          body.push({
            ...if_(out.expr, [{ kind: 'assign', target, value: result, source: c.id }]),
            ...meta,
          });
        }
      }
    }
  }

  return network(r.id, body, r.comment || undefined);
}

const COMPARE_OPS: Partial<Record<Contact['type'], CompareOp>> = {
  EQ: '=',
  NE: '<>',
  LT: '<',
  GT: '>',
  LE: '<=',
  GE: '>=',
};

const MATH_OPS: Partial<Record<Coil['type'], ArithOp>> = { ADD: '+', SUB: '-', MUL: '*', DIV: '/' };

/** Value computed by an output box (MOVE, ADD…, SCALE), or null if an operand is missing. */
function boxValue(c: Coil, value: (el: Coil, key: string) => Expr | null): Expr | null {
  if (c.type === 'MOVE') return value(c, 'in');
  const op = MATH_OPS[c.type];
  if (op) {
    const a = value(c, 'in1');
    const b = value(c, 'in2');
    return a && b ? arith(op, a, b) : null;
  }
  if (c.type === 'SCALE') {
    // OUT = (IN − inMin) · (outMax − outMin) / (inMax − inMin) + outMin, computed in REAL.
    const [x, inMin, inMax, outMin, outMax] = ['in', 'inMin', 'inMax', 'outMin', 'outMax'].map(
      (k) => value(c, k),
    );
    if (!x || !inMin || !inMax || !outMin || !outMax) return null;
    const r = (e: Expr) => convert('REAL', e);
    return add(
      div(mul(sub(r(x), r(inMin)), sub(r(outMax), r(outMin))), sub(r(inMax), r(inMin))),
      r(outMin),
    );
  }
  return null;
}

/** The same problem can be reported by the LD and engine layers; keep one of each. */
function dedupe(list: LadderDiagnostic[]): LadderDiagnostic[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = `${d.code}|${d.rungId ?? ''}|${d.elementId ?? ''}|${JSON.stringify(d.params)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
