/**
 * Static checks on an IR program before it runs (and for real-time editor feedback):
 * addresses, write permissions, data types, temporaries, edge/timer/counter instances.
 *
 * Type rules (kept friendly for learners):
 * - Logic (NOT/AND/OR/XOR, edges, set/reset, timer and counter inputs) needs BOOL.
 * - INT, REAL and TIME are all numbers and mix freely: REAL if any operand is REAL, else TIME
 *   if any is TIME, else INT. Storing a number into an INT word truncates and wraps (16 bits).
 * - = and <> also compare two BOOLs; <, >, <=, >= need numbers.
 */
import { IR_VERSION, type Expr, type IrProgram, type Stmt } from '@/simulator/ir/types';
import {
  formatAddress,
  isWritable,
  parseAddress,
  parseInstance,
  typeOfAddress,
  type DataType,
} from './address';
import type { Diagnostic } from './errors';
import { DEFAULT_LAYOUT, Memory, type MemoryLayout } from './memory';

export interface AnalyzeOptions {
  /**
   * Warn when the same address is assigned at the top level of more than one place (a Ladder/FBD
   * "duplicate coil"). Assignments nested inside IF/WHILE are never counted. Default: true.
   */
  warnDuplicateOutputs?: boolean;
}

/** 'ANY' marks an expression whose type could not be determined (an error was reported). */
type Inferred = DataType | 'ANY';

const isNumeric = (t: Inferred) => t === 'INT' || t === 'REAL' || t === 'TIME' || t === 'ANY';
const isBool = (t: Inferred) => t === 'BOOL' || t === 'ANY';

/** Result type of mixing numeric types. */
export function numericResult(a: Inferred, b: Inferred): Inferred {
  if (a === 'ANY' || b === 'ANY') return 'ANY';
  if (a === 'REAL' || b === 'REAL') return 'REAL';
  if (a === 'TIME' || b === 'TIME') return 'TIME';
  return 'INT';
}

export function constType(value: boolean | number, type?: DataType): DataType {
  if (type) return type;
  if (typeof value === 'boolean') return 'BOOL';
  return Number.isInteger(value) ? 'INT' : 'REAL';
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
  /** Where each timer/counter instance is called. */
  const calledAt = new Map<string, { networkId: string; source?: string }[]>();

  for (const net of program.networks) {
    const networkId = net.id;
    const push = (d: Omit<Diagnostic, 'networkId'>) => diagnostics.push({ ...d, networkId });
    const src = (source: string | undefined) => (source ? { source } : {});

    if (networkIds.has(networkId)) {
      push({ severity: 'error', code: 'DUPLICATE_NETWORK_ID', params: { id: networkId } });
    }
    networkIds.add(networkId);

    /** Type of an address, or null (and an error) if it does not exist. */
    const addressType = (address: string, source: string | undefined): Inferred => {
      const ref = parseAddress(address);
      if (!ref || !memory.containsAddress(ref)) {
        push({ severity: 'error', code: 'INVALID_ADDRESS', params: { address }, ...src(source) });
        return 'ANY';
      }
      return typeOfAddress(ref);
    };

    const expect = (
      actual: Inferred,
      ok: (t: Inferred) => boolean,
      expected: string,
      source?: string,
    ) => {
      if (!ok(actual)) {
        push({
          severity: 'error',
          code: 'TYPE_MISMATCH',
          params: { expected, actual },
          ...src(source),
        });
      }
    };

    /** Temporaries are scoped to the network and must be declared before use. */
    const temps = new Map<string, Inferred>();

    const typeOf = (e: Expr): Inferred => {
      switch (e.kind) {
        case 'const':
          return constType(e.value, e.type);
        case 'read':
          return addressType(e.address, e.source);
        case 'temp': {
          const t = temps.get(e.name);
          if (t === undefined) {
            push({
              severity: 'error',
              code: 'UNDEFINED_TEMP',
              params: { name: e.name },
              ...src(e.source),
            });
            return 'ANY';
          }
          return t;
        }
        case 'not':
          expect(typeOf(e.arg), isBool, 'BOOL', e.source);
          return 'BOOL';
        case 'and':
        case 'or':
        case 'xor':
          if (e.args.length === 0) {
            push({
              severity: 'error',
              code: 'EMPTY_OPERATION',
              params: { operation: e.kind },
              ...src(e.source),
            });
          }
          e.args.forEach((a) => expect(typeOf(a), isBool, 'BOOL', e.source ?? a.source));
          return 'BOOL';
        case 'edge':
          if (edgeInstances.has(e.instance)) {
            push({
              severity: 'error',
              code: 'DUPLICATE_EDGE_INSTANCE',
              params: { instance: e.instance },
              ...src(e.source),
            });
          }
          edgeInstances.add(e.instance);
          expect(typeOf(e.arg), isBool, 'BOOL', e.source);
          return 'BOOL';
        case 'compare': {
          const l = typeOf(e.left);
          const r = typeOf(e.right);
          const equality = e.op === '=' || e.op === '<>';
          const bothBool = l === 'BOOL' && r === 'BOOL';
          if (!(equality && bothBool)) {
            expect(l, isNumeric, 'NUMBER', e.source);
            expect(r, isNumeric, 'NUMBER', e.source);
          }
          return 'BOOL';
        }
        case 'arith': {
          const l = typeOf(e.left);
          const r = typeOf(e.right);
          expect(l, isNumeric, 'NUMBER', e.source);
          expect(r, isNumeric, 'NUMBER', e.source);
          return e.op === 'MOD'
            ? l === 'ANY' || r === 'ANY'
              ? 'ANY'
              : 'INT'
            : numericResult(l, r);
        }
        case 'convert':
          expect(typeOf(e.arg), isNumeric, 'NUMBER', e.source);
          return e.to;
      }
    };

    const checkTarget = (address: string, source: string | undefined): Inferred => {
      const type = addressType(address, source);
      if (type === 'ANY') return type;
      const ref = parseAddress(address);
      if (ref && !isWritable(ref)) {
        push({ severity: 'error', code: 'READ_ONLY_TARGET', params: { address }, ...src(source) });
      } else if (ref?.kind === 'bit' && ref.area === 'I') {
        push({ severity: 'warning', code: 'INPUT_WRITE', params: { address }, ...src(source) });
      }
      return type;
    };

    const checkInstance = (address: string, kind: 'timer' | 'counter', source?: string) => {
      const index = parseInstance(address, kind);
      const ref = parseAddress(address);
      if (index === null || !ref || !memory.containsAddress(ref)) {
        push({
          severity: 'error',
          code: 'INVALID_INSTANCE',
          params: { instance: address, kind },
          ...src(source),
        });
        return;
      }
      const key = formatAddress(ref);
      calledAt.set(key, [...(calledAt.get(key) ?? []), { networkId, ...src(source) }]);
    };

    const optionalBool = (e: Expr | undefined, source?: string) => {
      if (e) expect(typeOf(e), isBool, 'BOOL', source);
    };

    const visitStmt = (s: Stmt, nested = false): void => {
      switch (s.kind) {
        case 'assign': {
          const valueType = typeOf(s.value);
          const targetType = checkTarget(s.target, s.source);
          if (targetType === 'BOOL') expect(valueType, isBool, 'BOOL', s.source);
          else if (targetType !== 'ANY') expect(valueType, isNumeric, 'NUMBER', s.source);
          const ref = parseAddress(s.target);
          if (ref && !nested) {
            const canonical = formatAddress(ref);
            const list = assignedAt.get(canonical) ?? [];
            list.push({ networkId, ...src(s.source) });
            assignedAt.set(canonical, list);
          }
          return;
        }
        case 'set':
        case 'reset': {
          expect(typeOf(s.condition), isBool, 'BOOL', s.source);
          const t = checkTarget(s.target, s.source);
          if (t !== 'ANY') expect(t, isBool, 'BOOL', s.source);
          return;
        }
        case 'let':
          temps.set(s.name, typeOf(s.value));
          return;
        case 'if':
          expect(typeOf(s.condition), isBool, 'BOOL', s.source);
          s.then.forEach((x) => visitStmt(x, true));
          s.else?.forEach((x) => visitStmt(x, true));
          return;
        case 'while':
          expect(typeOf(s.condition), isBool, 'BOOL', s.source);
          s.body.forEach((x) => visitStmt(x, true));
          return;
        case 'timer':
          checkInstance(s.instance, 'timer', s.source);
          expect(typeOf(s.input), isBool, 'BOOL', s.source);
          expect(typeOf(s.preset), isNumeric, 'TIME', s.source);
          return;
        case 'counter':
          checkInstance(s.instance, 'counter', s.source);
          optionalBool(s.up, s.source);
          optionalBool(s.down, s.source);
          optionalBool(s.reset, s.source);
          optionalBool(s.load, s.source);
          expect(typeOf(s.preset), isNumeric, 'INT', s.source);
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

  for (const [instance, places] of calledAt) {
    if (places.length < 2) continue;
    for (const place of places) {
      diagnostics.push({
        severity: 'warning',
        code: 'DUPLICATE_INSTANCE',
        params: { instance, count: places.length },
        networkId: place.networkId,
        ...(place.source ? { source: place.source } : {}),
      });
    }
  }

  return diagnostics;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.some((d) => d.severity === 'error');
