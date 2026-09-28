/**
 * Static checks on an IR program before it runs (and for real-time editor feedback).
 */
import { IR_VERSION, type Expr, type IrProgram, type Stmt } from '@/simulator/ir/types';
import { parseBitAddress } from './address';
import type { Diagnostic } from './errors';
import { DEFAULT_LAYOUT, Memory, type MemoryLayout } from './memory';

export interface AnalyzeOptions {
  /**
   * Warn when the same address is assigned at the top level of more than one place (a Ladder/FBD
   * "duplicate coil"). Assignments nested inside IF/WHILE are never counted. Default: true.
   */
  warnDuplicateOutputs?: boolean;
}

export function analyze(
  program: IrProgram,
  layout: MemoryLayout = DEFAULT_LAYOUT,
  options: AnalyzeOptions = {},
): Diagnostic[] {
  const { warnDuplicateOutputs = true } = options;
  const diagnostics: Diagnostic[] = [];
  const memory = new Memory(layout);

  if (program.version !== IR_VERSION) {
    diagnostics.push({
      severity: 'error',
      code: 'UNSUPPORTED_VERSION',
      params: { version: String(program.version) },
    });
    return diagnostics;
  }

  const networkIds = new Set<string>();
  const edgeInstances = new Set<string>();
  /** Where each address is assigned (coils), to detect duplicates. */
  const assignedAt = new Map<string, { networkId: string; source?: string }[]>();

  for (const net of program.networks) {
    const networkId = net.id;
    const push = (d: Omit<Diagnostic, 'networkId'>) => diagnostics.push({ ...d, networkId });

    if (networkIds.has(networkId)) {
      push({ severity: 'error', code: 'DUPLICATE_NETWORK_ID', params: { id: networkId } });
    }
    networkIds.add(networkId);

    const checkAddress = (address: string, source: string | undefined): boolean => {
      const ref = parseBitAddress(address);
      if (!ref || !memory.contains(ref)) {
        push({
          severity: 'error',
          code: 'INVALID_ADDRESS',
          params: { address },
          ...(source ? { source } : {}),
        });
        return false;
      }
      return true;
    };

    const checkTarget = (address: string, source: string | undefined) => {
      if (!checkAddress(address, source)) return;
      const area = parseBitAddress(address)?.area;
      const src = source ? { source } : {};
      if (area === 'S') {
        push({ severity: 'error', code: 'READ_ONLY_TARGET', params: { address }, ...src });
      } else if (area === 'I') {
        push({ severity: 'warning', code: 'INPUT_WRITE', params: { address }, ...src });
      }
    };

    /** Temporaries are scoped to the network and must be declared before use. */
    const temps = new Set<string>();

    const visitExpr = (e: Expr): void => {
      switch (e.kind) {
        case 'const':
          return;
        case 'read':
          checkAddress(e.address, e.source);
          return;
        case 'temp':
          if (!temps.has(e.name)) {
            push({
              severity: 'error',
              code: 'UNDEFINED_TEMP',
              params: { name: e.name },
              ...(e.source ? { source: e.source } : {}),
            });
          }
          return;
        case 'not':
          visitExpr(e.arg);
          return;
        case 'and':
        case 'or':
        case 'xor':
          if (e.args.length === 0) {
            push({
              severity: 'error',
              code: 'EMPTY_OPERATION',
              params: { operation: e.kind },
              ...(e.source ? { source: e.source } : {}),
            });
          }
          e.args.forEach(visitExpr);
          return;
        case 'edge':
          if (edgeInstances.has(e.instance)) {
            push({
              severity: 'error',
              code: 'DUPLICATE_EDGE_INSTANCE',
              params: { instance: e.instance },
              ...(e.source ? { source: e.source } : {}),
            });
          }
          edgeInstances.add(e.instance);
          visitExpr(e.arg);
          return;
      }
    };

    const visitStmt = (s: Stmt, nested = false): void => {
      switch (s.kind) {
        case 'assign': {
          visitExpr(s.value);
          checkTarget(s.target, s.source);
          const key = parseBitAddress(s.target);
          if (key && !nested) {
            const canonical = `${key.area}${key.byte}.${key.bit}`;
            const list = assignedAt.get(canonical) ?? [];
            list.push({ networkId, ...(s.source ? { source: s.source } : {}) });
            assignedAt.set(canonical, list);
          }
          return;
        }
        case 'set':
        case 'reset':
          visitExpr(s.condition);
          checkTarget(s.target, s.source);
          return;
        case 'let':
          visitExpr(s.value);
          temps.add(s.name);
          return;
        case 'if':
          visitExpr(s.condition);
          s.then.forEach((x) => visitStmt(x, true));
          s.else?.forEach((x) => visitStmt(x, true));
          return;
        case 'while':
          visitExpr(s.condition);
          s.body.forEach((x) => visitStmt(x, true));
          return;
      }
    };

    net.body.forEach((x) => visitStmt(x));
  }

  for (const [address, places] of assignedAt) {
    if (!warnDuplicateOutputs || places.length < 2) continue;
    for (const place of places) {
      diagnostics.push({
        severity: 'warning',
        code: 'DUPLICATE_OUTPUT',
        params: { address, count: places.length },
        networkId: place.networkId,
        ...(place.source ? { source: place.source } : {}),
      });
    }
  }

  return diagnostics;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.some((d) => d.severity === 'error');
