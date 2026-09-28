/**
 * Compiles IR into closures once, at load time, so every scan just calls functions.
 * Addresses are resolved to (array, index) pairs here; nothing is parsed during a scan.
 */
import type { Expr, IrProgram, Stmt } from '@/simulator/ir/types';
import { bitIndex, parseBitAddress } from './address';
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
import type { Memory } from './memory';

/** Mutable state shared by the compiled closures of one runtime. */
export interface ExecContext {
  memory: Memory;
  /** Network-local temporaries; cleared before each network. */
  temps: Map<string, boolean>;
  /** Last value of every probed node, or null when tracing is off. */
  probes: Map<string, boolean> | null;
  /** Steps executed in the current scan and the maximum allowed (watchdog). */
  steps: number;
  maxSteps: number;
}

export interface CompiledNetwork {
  id: string;
  run: Action;
}

function resolve(memory: Memory, address: string): { area: Uint8Array; index: number } {
  const ref = parseBitAddress(address);
  // analyze() guarantees valid addresses before compiling; this is a safety net.
  if (!ref || !memory.contains(ref)) throw new RangeError(`Invalid address: ${address}`);
  return { area: memory.bits[ref.area], index: bitIndex(ref) };
}

function compileExpr(e: Expr, ctx: ExecContext): BoolFn {
  const fn = compileExprInner(e, ctx);
  const probe = e.probe;
  if (probe === undefined) return fn;
  return () => {
    const v = fn();
    ctx.probes?.set(probe, v);
    return v;
  };
}

function compileExprInner(e: Expr, ctx: ExecContext): BoolFn {
  switch (e.kind) {
    case 'const':
      return constant(e.value);
    case 'read': {
      const { area, index } = resolve(ctx.memory, e.address);
      return readBit(area, index);
    }
    case 'temp': {
      const name = e.name;
      return () => ctx.temps.get(name) ?? false;
    }
    case 'not':
      return notOp(compileExpr(e.arg, ctx));
    case 'and':
      return andOp(e.args.map((a) => compileExpr(a, ctx)));
    case 'or':
      return orOp(e.args.map((a) => compileExpr(a, ctx)));
    case 'xor':
      return xorOp(e.args.map((a) => compileExpr(a, ctx)));
    case 'edge':
      return edgeOp(ctx.memory, e.instance, e.direction, compileExpr(e.arg, ctx));
  }
}

function compileStmt(s: Stmt, ctx: ExecContext): Action {
  const action = compileStmtInner(s, ctx);
  // Every statement costs one step; the watchdog stops runaway programs.
  return () => {
    if (++ctx.steps > ctx.maxSteps) throw new WatchdogError();
    action();
  };
}

function compileBlock(body: Stmt[], ctx: ExecContext): Action {
  const actions = body.map((s) => compileStmt(s, ctx));
  return () => {
    for (const a of actions) a();
  };
}

function compileStmtInner(s: Stmt, ctx: ExecContext): Action {
  const probe = s.probe;
  const record = probe === undefined ? undefined : (v: boolean) => ctx.probes?.set(probe, v);

  switch (s.kind) {
    case 'assign': {
      const { area, index } = resolve(ctx.memory, s.target);
      return assignBit(area, index, compileExpr(s.value, ctx), record);
    }
    case 'set': {
      const { area, index } = resolve(ctx.memory, s.target);
      return setBit(area, index, compileExpr(s.condition, ctx), record);
    }
    case 'reset': {
      const { area, index } = resolve(ctx.memory, s.target);
      return resetBit(area, index, compileExpr(s.condition, ctx), record);
    }
    case 'let': {
      const name = s.name;
      const value = compileExpr(s.value, ctx);
      return () => {
        const v = value();
        ctx.temps.set(name, v);
        record?.(v);
      };
    }
    case 'if': {
      const condition = compileExpr(s.condition, ctx);
      const thenBlock = compileBlock(s.then, ctx);
      const elseBlock = s.else ? compileBlock(s.else, ctx) : undefined;
      return () => {
        const c = condition();
        record?.(c);
        if (c) thenBlock();
        else elseBlock?.();
      };
    }
    case 'while': {
      const condition = compileExpr(s.condition, ctx);
      const body = compileBlock(s.body, ctx);
      return () => {
        while (condition()) {
          if (++ctx.steps > ctx.maxSteps) throw new WatchdogError();
          body();
        }
      };
    }
  }
}

export function compileProgram(program: IrProgram, ctx: ExecContext): CompiledNetwork[] {
  return program.networks.map((net) => {
    const block = compileBlock(net.body, ctx);
    return {
      id: net.id,
      run: () => {
        ctx.temps.clear();
        block();
      },
    };
  });
}
