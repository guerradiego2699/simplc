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
 * The editor colours wires and symbols from these probes (power flow in RUN).
 */
import { analyze, type Diagnostic as EngineDiagnostic } from '@/simulator/engine';
import {
  and,
  falling,
  let_,
  network,
  not,
  or,
  program as irProgram,
  read,
  rising,
  temp,
  TRUE,
} from '@/simulator/ir/builders';
import type { Expr, IrProgram, Stmt } from '@/simulator/ir/types';
import { resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import type { Contact, LadderProgram, Rung, Series } from './model';

/** Probe id of the power at the left rail (always TRUE while running). */
export const RAIL = 'rail';
export const stateProbe = (contactId: string) => `${contactId}:state`;

export type LadderDiagnosticCode =
  | EngineDiagnostic['code']
  | 'MISSING_OPERAND'
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

  const resolve = (elementId: string, operand: string): string | null => {
    const res = resolveOperand(operand, tags);
    if (res.ok) return res.address;
    diagnostics.push({
      severity: 'error',
      code: res.problem,
      params: { operand: operand.trim() },
      rungId: r.id,
      elementId,
    });
    return null;
  };

  const contactCondition = (c: Contact, address: string): Expr => {
    const bit: Expr = { ...read(address), source: c.id };
    switch (c.type) {
      case 'NO':
        return bit;
      case 'NC':
        return not(bit);
      case 'P':
        return { ...rising(bit, c.id), source: c.id };
      case 'N':
        return { ...falling(bit, c.id), source: c.id };
    }
  };

  const compileSeries = (s: Series, input: Power, isBranch: boolean): Power => {
    if (isBranch && s.items.length === 0) {
      diagnostics.push({ severity: 'warning', code: 'EMPTY_BRANCH', params: {}, rungId: r.id });
    }
    let power = input;
    for (const item of s.items) {
      if (item.kind === 'contact') {
        const address = resolve(item.id, item.operand);
        const stateName = `s_${item.id}`;
        const powerName = `p_${item.id}`;
        body.push({
          ...let_(
            stateName,
            address ? contactCondition(item, address) : { kind: 'const', value: false },
          ),
          probe: stateProbe(item.id),
        });
        body.push({ ...let_(powerName, and(power.expr, temp(stateName))), probe: item.id });
        power = { ref: item.id, expr: temp(powerName) };
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
    const address = resolve(c.id, c.operand);
    if (!address) continue;
    const meta = { source: c.id, probe: c.id };
    switch (c.type) {
      case 'coil':
        body.push({ kind: 'assign', target: address, value: out.expr, ...meta });
        break;
      case 'negated':
        body.push({ kind: 'assign', target: address, value: not(out.expr), ...meta });
        break;
      case 'set':
        body.push({ kind: 'set', target: address, condition: out.expr, ...meta });
        break;
      case 'reset':
        body.push({ kind: 'reset', target: address, condition: out.expr, ...meta });
        break;
    }
  }

  return network(r.id, body, r.comment || undefined);
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
