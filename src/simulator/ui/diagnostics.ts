/** Turns diagnostic codes into translated messages. */
import type { LadderDiagnostic } from '@/simulator/languages/ladder/compile';
import { fmt, type SimStrings } from './context';

/** Parameter values that are themselves translatable (param names, data types). */
function translateParams(d: LadderDiagnostic, t: SimStrings): Record<string, string | number> {
  const params = { ...d.params };
  const paramNames = t.params as Record<string, string>;
  const types = t.types as Record<string, string>;
  if (typeof params['param'] === 'string')
    params['param'] = paramNames[params['param']] ?? params['param'];
  for (const key of ['expected', 'actual'] as const) {
    const v = params[key];
    if (typeof v === 'string') params[key] = types[v] ?? v;
  }
  return params;
}

export function diagnosticMessage(d: LadderDiagnostic, t: SimStrings): string {
  const template = (t.diagnostics as Record<string, string>)[d.code] ?? d.code;
  return fmt(template, translateParams(d, t));
}

export interface DiagnosticIndex {
  byElement: Map<string, LadderDiagnostic[]>;
  byRung: Map<string, LadderDiagnostic[]>;
  errors: number;
  warnings: number;
}

export function indexDiagnostics(list: readonly LadderDiagnostic[]): DiagnosticIndex {
  const byElement = new Map<string, LadderDiagnostic[]>();
  const byRung = new Map<string, LadderDiagnostic[]>();
  let errors = 0;
  let warnings = 0;
  for (const d of list) {
    if (d.severity === 'error') errors++;
    else warnings++;
    if (d.elementId) byElement.set(d.elementId, [...(byElement.get(d.elementId) ?? []), d]);
    if (d.rungId) byRung.set(d.rungId, [...(byRung.get(d.rungId) ?? []), d]);
  }
  return { byElement, byRung, errors, warnings };
}

export const worst = (list: readonly LadderDiagnostic[] | undefined) =>
  !list?.length ? null : list.some((d) => d.severity === 'error') ? 'error' : 'warning';
