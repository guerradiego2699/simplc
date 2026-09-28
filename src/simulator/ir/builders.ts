/**
 * Small helpers to build IR by hand (compilers and tests). They only create plain objects.
 */
import {
  IR_VERSION,
  type ArithOp,
  type AssignStmt,
  type CompareOp,
  type ConvertExpr,
  type CounterStmt,
  type TimerStmt,
  type EdgeExpr,
  type Expr,
  type IfStmt,
  type IrProgram,
  type LetStmt,
  type Network,
  type ResetStmt,
  type SetStmt,
  type Stmt,
  type WhileStmt,
} from './types';

export const TRUE: Expr = { kind: 'const', value: true };
export const FALSE: Expr = { kind: 'const', value: false };

export const read = (address: string): Expr => ({ kind: 'read', address });
export const temp = (name: string): Expr => ({ kind: 'temp', name });
export const not = (arg: Expr): Expr => ({ kind: 'not', arg });
export const and = (...args: Expr[]): Expr => ({ kind: 'and', args });
export const or = (...args: Expr[]): Expr => ({ kind: 'or', args });
export const xor = (...args: Expr[]): Expr => ({ kind: 'xor', args });

/** Normally open contact: TRUE when the bit is 1. */
export const no = read;
/** Normally closed contact: TRUE when the bit is 0. */
export const nc = (address: string): Expr => not(read(address));

export const rising = (arg: Expr, instance: string): EdgeExpr => ({
  kind: 'edge',
  direction: 'rising',
  arg,
  instance,
});
export const falling = (arg: Expr, instance: string): EdgeExpr => ({
  kind: 'edge',
  direction: 'falling',
  arg,
  instance,
});

export const assign = (target: string, value: Expr): AssignStmt => ({
  kind: 'assign',
  target,
  value,
});
/** Negated coil: target := NOT value. */
export const assignNot = (target: string, value: Expr): AssignStmt => assign(target, not(value));
export const set = (target: string, condition: Expr): SetStmt => ({
  kind: 'set',
  target,
  condition,
});
export const reset = (target: string, condition: Expr): ResetStmt => ({
  kind: 'reset',
  target,
  condition,
});
export const let_ = (name: string, value: Expr): LetStmt => ({ kind: 'let', name, value });
export const if_ = (condition: Expr, then: Stmt[], otherwise?: Stmt[]): IfStmt =>
  otherwise ? { kind: 'if', condition, then, else: otherwise } : { kind: 'if', condition, then };
export const while_ = (condition: Expr, body: Stmt[]): WhileStmt => ({
  kind: 'while',
  condition,
  body,
});

/**
 * IEC SR flip-flop (set dominant): Q := S OR (NOT R AND Q).
 * IEC RS flip-flop (reset dominant): Q := NOT R AND (S OR Q).
 * Expressed with plain IR so every language can use them.
 */
export const sr = (target: string, s: Expr, r: Expr): AssignStmt =>
  assign(target, or(s, and(not(r), read(target))));
export const rs = (target: string, s: Expr, r: Expr): AssignStmt =>
  assign(target, and(not(r), or(s, read(target))));

export const network = (id: string, body: Stmt[], label?: string): Network =>
  label ? { id, label, body } : { id, body };

export const program = (...networks: Network[]): IrProgram => ({ version: IR_VERSION, networks });

// ---------------------------------------------------------------------------------------------
// Numbers, comparisons, arithmetic and function blocks (Phase 5)
// ---------------------------------------------------------------------------------------------

export const int = (value: number): Expr => ({ kind: 'const', value, type: 'INT' });
export const real = (value: number): Expr => ({ kind: 'const', value, type: 'REAL' });
/** TIME constant in milliseconds. */
export const time = (ms: number): Expr => ({ kind: 'const', value: ms, type: 'TIME' });

export const cmp = (op: CompareOp, left: Expr, right: Expr): Expr => ({
  kind: 'compare',
  op,
  left,
  right,
});
export const arith = (op: ArithOp, left: Expr, right: Expr): Expr => ({
  kind: 'arith',
  op,
  left,
  right,
});
export const add = (l: Expr, r: Expr) => arith('+', l, r);
export const sub = (l: Expr, r: Expr) => arith('-', l, r);
export const mul = (l: Expr, r: Expr) => arith('*', l, r);
export const div = (l: Expr, r: Expr) => arith('/', l, r);
export const convert = (to: ConvertExpr['to'], arg: Expr): Expr => ({ kind: 'convert', to, arg });

/** MOVE: target := value (numbers or booleans). */
export const move = assign;

export const timerCall = (
  type: TimerStmt['type'],
  instance: string,
  input: Expr,
  preset: Expr,
): TimerStmt => ({ kind: 'timer', type, instance, input, preset });
export const ton = (instance: string, input: Expr, preset: Expr) =>
  timerCall('TON', instance, input, preset);
export const tof = (instance: string, input: Expr, preset: Expr) =>
  timerCall('TOF', instance, input, preset);
export const tp = (instance: string, input: Expr, preset: Expr) =>
  timerCall('TP', instance, input, preset);

export const counterCall = (
  type: CounterStmt['type'],
  instance: string,
  pins: { up?: Expr; down?: Expr; reset?: Expr; load?: Expr; preset: Expr },
): CounterStmt => ({ kind: 'counter', type, instance, ...pins });
