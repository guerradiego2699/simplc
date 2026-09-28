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

export const IR_VERSION = 1;

/** Optional metadata any node can carry. */
export interface NodeMeta {
  /** Id of the source element (e.g. a Ladder contact) — used for diagnostics and highlighting. */
  source?: string;
  /** When tracing is on, the engine records this node's last value under this id (power flow). */
  probe?: string;
}

// ---------------------------------------------------------------------------------------------
// Expressions (Phase 3: BOOL only; numbers, comparisons and function blocks arrive in Phase 5)
// ---------------------------------------------------------------------------------------------

export interface ConstExpr extends NodeMeta {
  kind: 'const';
  value: boolean;
}

/** Reads a bit address in generic notation: "I0.0", "Q1.7", "M10.3", "S0.1". */
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

export type Expr = ConstExpr | ReadExpr | TempExpr | NotExpr | LogicExpr | EdgeExpr;

// ---------------------------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------------------------

/** target := value (a Ladder coil). */
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

export type Stmt = AssignStmt | SetStmt | ResetStmt | LetStmt | IfStmt | WhileStmt;

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
