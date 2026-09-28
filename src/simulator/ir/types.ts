/**
 * Intermediate representation (IR) shared by every language.
 *
 * Ladder, ST, FBD, IL and SFC all compile to this tree; the engine only executes IR.
 * It is plain JSON-serializable data so it can also be inspected, tested and decompiled
 * (e.g. Ladder → ST).
 *
 * Semantics worth knowing:
 * - `and` / `or` / `xor` evaluate ALL their arguments every time (no short-circuit), like a real
 *   PLC. This keeps edge detectors inside a branch updated even when an earlier contact is open.
 * - Networks run in order, statements run in order: the last write to an address wins.
 * - Temporaries (`let` / `temp`) live only inside the network that declares them.
 */

import type { DataType } from '@/simulator/engine/address';

export type { DataType };

export const IR_VERSION = 1;

/** Optional metadata any node can carry. */
export interface NodeMeta {
  /** Id of the source element (e.g. a Ladder contact) — used for diagnostics and highlighting. */
  source?: string;
  /** When tracing is on, the engine records this node's last value under this id (power flow). */
  probe?: string;
}

// ---------------------------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------------------------

export interface ConstExpr extends NodeMeta {
  kind: 'const';
  value: boolean | number;
  /** Required for numbers (INT, REAL or TIME in ms); BOOL for booleans. */
  type?: DataType;
}

/**
 * Reads an address in generic notation: bits ("I0.0", "M10.3", "S0.1"), words ("MW3", "MD0",
 * "IW0"), timer/counter members ("T0" = Q, "T0.ET", "C1.CV").
 */
export interface ReadExpr extends NodeMeta {
  kind: 'read';
  address: string;
}

/** Reads a network-local temporary declared earlier with a `let` statement. */
export interface TempExpr extends NodeMeta {
  kind: 'temp';
  name: string;
}

export interface NotExpr extends NodeMeta {
  kind: 'not';
  arg: Expr;
}

/** N-ary logic. `xor` is true when an odd number of arguments are true. */
export interface LogicExpr extends NodeMeta {
  kind: 'and' | 'or' | 'xor';
  args: Expr[];
}

/**
 * Edge detector. Returns true during the single evaluation in which `arg` changed
 * (FALSE→TRUE for rising, TRUE→FALSE for falling). `instance` identifies the hidden memory bit
 * that stores the previous value; it must be unique in the program.
 */
export interface EdgeExpr extends NodeMeta {
  kind: 'edge';
  direction: 'rising' | 'falling';
  arg: Expr;
  instance: string;
}

export type CompareOp = '=' | '<>' | '<' | '>' | '<=' | '>=';
export type ArithOp = '+' | '-' | '*' | '/' | 'MOD';

/** Comparison of two numbers (or two BOOLs for = and <>). */
export interface CompareExpr extends NodeMeta {
  kind: 'compare';
  op: CompareOp;
  left: Expr;
  right: Expr;
}

/**
 * Arithmetic. Result type: REAL if any operand is REAL, else TIME if any is TIME, else INT.
 * INT division truncates toward zero; division by zero yields 0.
 */
export interface ArithExpr extends NodeMeta {
  kind: 'arith';
  op: ArithOp;
  left: Expr;
  right: Expr;
}

/** Explicit numeric conversion (e.g. INT_TO_REAL). REAL → INT truncates toward zero. */
export interface ConvertExpr extends NodeMeta {
  kind: 'convert';
  to: Exclude<DataType, 'BOOL'>;
  arg: Expr;
}

export type Expr =
  | ConstExpr
  | ReadExpr
  | TempExpr
  | NotExpr
  | LogicExpr
  | EdgeExpr
  | CompareExpr
  | ArithExpr
  | ConvertExpr;

// ---------------------------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------------------------

/** target := value (a Ladder coil, or MOVE for numbers). */
export interface AssignStmt extends NodeMeta {
  kind: 'assign';
  target: string;
  value: Expr;
}

/** IF condition THEN target := TRUE (a Ladder Set coil). */
export interface SetStmt extends NodeMeta {
  kind: 'set';
  target: string;
  condition: Expr;
}

/** IF condition THEN target := FALSE (a Ladder Reset coil). */
export interface ResetStmt extends NodeMeta {
  kind: 'reset';
  target: string;
  condition: Expr;
}

/** Declares/overwrites a network-local temporary. */
export interface LetStmt extends NodeMeta {
  kind: 'let';
  name: string;
  value: Expr;
}

export interface IfStmt extends NodeMeta {
  kind: 'if';
  condition: Expr;
  then: Stmt[];
  else?: Stmt[];
}

export interface WhileStmt extends NodeMeta {
  kind: 'while';
  condition: Expr;
  body: Stmt[];
}

/**
 * Timer call (IEC TON / TOF / TP). `instance` is a timer address ("T0"). The preset is TIME
 * (or INT, read as milliseconds). Q, ET and PT are then readable as T0, T0.ET, T0.PT.
 */
export interface TimerStmt extends NodeMeta {
  kind: 'timer';
  type: 'TON' | 'TOF' | 'TP';
  instance: string;
  input: Expr;
  preset: Expr;
}

/**
 * Counter call (IEC CTU / CTD / CTUD). Counting happens on rising edges of up/down.
 * Reset has priority over load. Outputs readable as C0 (Q), C0.QU, C0.QD, C0.CV, C0.PV.
 */
export interface CounterStmt extends NodeMeta {
  kind: 'counter';
  type: 'CTU' | 'CTD' | 'CTUD';
  instance: string;
  up?: Expr;
  down?: Expr;
  reset?: Expr;
  load?: Expr;
  preset: Expr;
}

export type Stmt =
  AssignStmt | SetStmt | ResetStmt | LetStmt | IfStmt | WhileStmt | TimerStmt | CounterStmt;

// ---------------------------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------------------------

/** A unit executed in order (a Ladder rung, an FBD network, or a whole ST program). */
export interface Network {
  id: string;
  label?: string;
  body: Stmt[];
}

export interface IrProgram {
  version: typeof IR_VERSION;
  networks: Network[];
}
