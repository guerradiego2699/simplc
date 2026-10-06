/** Abstract syntax tree of a Structured Text program. Every node keeps its source range. */
import type { Range } from './lexer';

export type StType =
  | 'BOOL'
  | 'INT'
  | 'REAL'
  | 'TIME'
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'R_TRIG'
  | 'F_TRIG';

export const ST_TYPES: readonly StType[] = [
  'BOOL',
  'INT',
  'REAL',
  'TIME',
  'TON',
  'TOF',
  'TP',
  'CTU',
  'CTD',
  'CTUD',
  'R_TRIG',
  'F_TRIG',
];

export interface VarDecl {
  name: string;
  type: StType;
  init?: Expression;
  range: Range;
}

/** A variable reference: a name (tag, local, address) and optional member (`T1.ET`). */
export interface VarRef {
  kind: 'var';
  name: string;
  member?: string;
  range: Range;
}

export type Expression =
  | VarRef
  | { kind: 'bool'; value: boolean; range: Range }
  | { kind: 'number'; text: string; range: Range }
  | { kind: 'time'; text: string; range: Range }
  | { kind: 'unary'; op: 'NOT' | '-'; arg: Expression; range: Range }
  | { kind: 'binary'; op: string; left: Expression; right: Expression; range: Range }
  | { kind: 'call'; name: string; args: Expression[]; range: Range };

export interface Param {
  name: string;
  value: Expression;
  range: Range;
}

export interface CaseBranch {
  labels: { from: Expression; to?: Expression }[];
  body: Statement[];
}

export type Statement =
  | { kind: 'assign'; target: VarRef; value: Expression; range: Range }
  | { kind: 'fbcall'; name: string; params: Param[]; range: Range }
  | {
      kind: 'if';
      branches: { condition: Expression; body: Statement[] }[];
      else?: Statement[];
      range: Range;
    }
  | {
      kind: 'case';
      selector: Expression;
      branches: CaseBranch[];
      else?: Statement[];
      range: Range;
    }
  | {
      kind: 'for';
      variable: VarRef;
      from: Expression;
      to: Expression;
      by?: Expression;
      body: Statement[];
      range: Range;
    }
  | { kind: 'while'; condition: Expression; body: Statement[]; range: Range }
  | { kind: 'repeat'; body: Statement[]; until: Expression; range: Range }
  | { kind: 'exit'; range: Range }
  | { kind: 'return'; range: Range };

export interface StProgram {
  name?: string;
  vars: VarDecl[];
  body: Statement[];
}
