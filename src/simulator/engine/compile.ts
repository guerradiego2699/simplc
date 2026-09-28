/**
 * Compiles IR into closures once, at load time, so every scan just calls functions.
 * Addresses are resolved to arrays/indexes here; nothing is parsed during a scan.
 */
import type { Expr, IrProgram, Stmt } from '@/simulator/ir/types';
import { bitIndex, parseAddress, typeOfAddress, type AddressRef, type DataType } from './address';
import { constType, numericResult } from './analyze';
import { WatchdogError } from './errors';
import {
  andOp,
  constant,
  edgeOp,
  notOp,
  orOp,
  readBit,
  xorOp,
  type BoolFn,
} from './instructions/bit-logic';
import { assignBit, resetBit, setBit, type Action } from './instructions/coils';
import { runCounter } from './instructions/counters';
import { arithOp, compareOp, convertOp, type Value, type ValueFn } from './instructions/math';
import { runTimer } from './instructions/timers';
import type { CounterState, Memory, TimerState } from './memory';

/** Mutable state shared by the compiled closures of one runtime. */
export interface ExecContext {
  memory: Memory;
  /** Network-local temporaries; cleared before each network. */
  temps: Map<string, Value>;
  /** Last value of every probed node, or null when tracing is off. */
  probes: Map<string, Value> | null;
  /** Steps executed in the current scan and the maximum allowed (watchdog). */
  steps: number;
  maxSteps: number;
  /** Simulated time (ms) at the start of the current scan, used by timers. */
  now: number;
}

export interface CompiledNetwork {
  id: string;
  run: Action;
}

function resolveRef(memory: Memory, address: string): AddressRef {
  const ref = parseAddress(address);
  // analyze() guarantees valid addresses before compiling; this is a safety net.
  if (!ref || !memory.containsAddress(ref)) throw new RangeError(`Invalid address: ${address}`);
  return ref;
}

function readFn(memory: Memory, ref: AddressRef): ValueFn {
  switch (ref.kind) {
    case 'bit':
      return readBit(memory.bits[ref.area], bitIndex(ref));
    case 'word': {
      const arr = memory.words[ref.area];
      const i = ref.index;
      return () => arr[i] ?? 0;
    }
    default:
      return () => memory.read(ref);
  }
}

/** Static type of an expression (analyze() has already reported mismatches). */
function inferType(e: Expr, temps: Map<string, DataType>): DataType {
  switch (e.kind) {
    case 'const':
      return constType(e.value, e.type);
    case 'read': {
      const ref = parseAddress(e.address);
      return ref ? typeOfAddress(ref) : 'BOOL';
    }
    case 'temp':
      return temps.get(e.name) ?? 'BOOL';
    case 'arith': {
      if (e.op === 'MOD') return 'INT';
      const t = numericResult(inferType(e.left, temps), inferType(e.right, temps));
      return t === 'ANY' ? 'INT' : t;
    }
    case 'convert':
      return e.to;
    default:
      return 'BOOL';
  }
}

interface Scope {
  ctx: ExecContext;
  tempTypes: Map<string, DataType>;
}

function compileExpr(e: Expr, scope: Scope): ValueFn {
  const fn = compileExprInner(e, scope);
  const probe = e.probe;
  if (probe === undefined) return fn;
  const { ctx } = scope;
  return () => {
    const v = fn();
    ctx.probes?.set(probe, v);
    return v;
  };
}

const bool = (e: Expr, scope: Scope) => compileExpr(e, scope) as BoolFn;

function compileExprInner(e: Expr, scope: Scope): ValueFn {
  const { ctx } = scope;
  switch (e.kind) {
    case 'const':
      return typeof e.value === 'boolean' ? constant(e.value) : () => e.value;
    case 'read':
      return readFn(ctx.memory, resolveRef(ctx.memory, e.address));
    case 'temp': {
      const name = e.name;
      return () => ctx.temps.get(name) ?? false;
    }
    case 'not':
      return notOp(bool(e.arg, scope));
    case 'and':
      return andOp(e.args.map((a) => bool(a, scope)));
    case 'or':
      return orOp(e.args.map((a) => bool(a, scope)));
    case 'xor':
      return xorOp(e.args.map((a) => bool(a, scope)));
    case 'edge':
      return edgeOp(ctx.memory, e.instance, e.direction, bool(e.arg, scope));
    case 'compare':
      return compareOp(e.op, compileExpr(e.left, scope), compileExpr(e.right, scope));
    case 'arith':
      return arithOp(
        e.op,
        inferType(e, scope.tempTypes),
        compileExpr(e.left, scope),
        compileExpr(e.right, scope),
      );
    case 'convert':
      return convertOp(e.to, compileExpr(e.arg, scope));
  }
}

function compileStmt(s: Stmt, scope: Scope): Action {
  const action = compileStmtInner(s, scope);
  const { ctx } = scope;
  // Every statement costs one step; the watchdog stops runaway programs.
  return () => {
    if (++ctx.steps > ctx.maxSteps) throw new WatchdogError();
    action();
  };
}

function compileBlock(body: Stmt[], scope: Scope): Action {
  const actions = body.map((s) => compileStmt(s, scope));
  return () => {
    for (const a of actions) a();
  };
}

function compileStmtInner(s: Stmt, scope: Scope): Action {
  const { ctx } = scope;
  const memory = ctx.memory;
  const probe = s.probe;
  const record = probe === undefined ? undefined : (v: Value) => ctx.probes?.set(probe, v);

  switch (s.kind) {
    case 'assign': {
      const ref = resolveRef(memory, s.target);
      if (ref.kind === 'bit') {
        return assignBit(memory.bits[ref.area], bitIndex(ref), bool(s.value, scope), record);
      }
      if (ref.kind !== 'word') throw new RangeError(`Read-only target: ${s.target}`);
      const arr = memory.words[ref.area];
      const i = ref.index;
      const value = compileExpr(s.value, scope);
      // Typed arrays do the PLC conversion: Int16 truncates and wraps, Float32 rounds.
      return () => {
        const v = value() as number;
        arr[i] = v;
        record?.(arr[i] ?? 0);
      };
    }
    case 'set':
    case 'reset': {
      const ref = resolveRef(memory, s.target);
      if (ref.kind !== 'bit') throw new RangeError(`Not a bit: ${s.target}`);
      const op = s.kind === 'set' ? setBit : resetBit;
      return op(memory.bits[ref.area], bitIndex(ref), bool(s.condition, scope), record);
    }
    case 'let': {
      const name = s.name;
      const value = compileExpr(s.value, scope);
      scope.tempTypes.set(name, inferType(s.value, scope.tempTypes));
      return () => {
        const v = value();
        ctx.temps.set(name, v);
        record?.(v);
      };
    }
    case 'if': {
      const condition = bool(s.condition, scope);
      const thenBlock = compileBlock(s.then, scope);
      const elseBlock = s.else ? compileBlock(s.else, scope) : undefined;
      return () => {
        const c = condition();
        record?.(c);
        if (c) thenBlock();
        else elseBlock?.();
      };
    }
    case 'while': {
      const condition = bool(s.condition, scope);
      const body = compileBlock(s.body, scope);
      return () => {
        while (condition()) {
          if (++ctx.steps > ctx.maxSteps) throw new WatchdogError();
          body();
        }
      };
    }
    case 'timer': {
      const ref = resolveRef(memory, s.instance);
      const state = memory.timers[ref.kind === 'timer' ? ref.index : 0] as TimerState;
      const input = bool(s.input, scope);
      const preset = compileExpr(s.preset, scope);
      const type = s.type;
      return () => {
        runTimer(state, type, input(), preset() as number, ctx.now);
        record?.(state.q);
      };
    }
    case 'counter': {
      const ref = resolveRef(memory, s.instance);
      const state = memory.counters[ref.kind === 'counter' ? ref.index : 0] as CounterState;
      const off: BoolFn = () => false;
      const up = s.up ? bool(s.up, scope) : off;
      const down = s.down ? bool(s.down, scope) : off;
      const reset = s.reset ? bool(s.reset, scope) : off;
      const load = s.load ? bool(s.load, scope) : off;
      const preset = compileExpr(s.preset, scope);
      const type = s.type;
      return () => {
        runCounter(state, type, {
          up: up(),
          down: down(),
          reset: reset(),
          load: load(),
          preset: preset() as number,
        });
        record?.(type === 'CTD' ? state.qd : state.qu);
      };
    }
  }
}

export function compileProgram(program: IrProgram, ctx: ExecContext): CompiledNetwork[] {
  return program.networks.map((net) => {
    const block = compileBlock(net.body, { ctx, tempTypes: new Map() });
    return {
      id: net.id,
      run: () => {
        ctx.temps.clear();
        block();
      },
    };
  });
}
