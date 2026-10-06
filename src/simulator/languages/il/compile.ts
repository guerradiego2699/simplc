/**
 * Instruction List (IL, IEC 61131-3 2nd edition) → IR compiler.
 *
 * IL works with an accumulator, the "current result" (CR): `LD x` loads it, `AND y` combines it,
 * `ST q` stores it. The translator walks the instructions keeping CR as an expression tree and
 * emits the equivalent Structured Text AST, which the ST compiler turns into IR (so names, VAR
 * blocks, timers/counters and type checks behave exactly as in ST).
 *
 * - Before anything that writes memory, CR is frozen in a temporary, so later instructions see
 *   the value it had at that point (as on a real accumulator).
 * - Parentheses defer an operation: `AND( LD b OR c )` = CR AND (b OR c). Nesting is allowed.
 * - Jumps go forward only (no loops): instructions between `JMPC L` and `L:` are skipped while
 *   the jump flag is set. After a label that is a jump target, CR must be loaded again.
 * - `CAL T1(IN := x, PT := T#5s)` calls a function block declared in VAR (as in ST).
 * - Every line records its CR as probe `il:<line>`, which the editor shows in RUN.
 */
import type { Expression, Param, Statement, StProgram, VarDecl } from '../st/ast';
import { compileStProgram, type StCompileResult, type StDiagnostic } from '../st/compile';
import type { Range, Token } from '../st/lexer';
import { createParser, ParseError, tokenizeOrThrow } from '../st/parser';
import type { Tag } from '@/simulator/project/types';

export const IL_NETWORK_ID = 'il';

export type IlDiagnosticCode =
  | 'IL_UNKNOWN_OPERATOR'
  | 'IL_MISSING_OPERAND'
  | 'IL_UNEXPECTED_OPERAND'
  | 'IL_NOT_A_VARIABLE'
  | 'IL_NEEDS_LOAD'
  | 'IL_UNKNOWN_LABEL'
  | 'IL_DUPLICATE_LABEL'
  | 'IL_BACKWARD_JUMP'
  | 'IL_UNCLOSED_PAREN'
  | 'IL_UNEXPECTED_PAREN'
  | 'IL_NO_DEFERRED';

/** Probe id that holds the current result after a line. */
export const ilProbe = (line: number) => `il:${line}`;

type Base =
  | 'LD'
  | 'ST'
  | 'S'
  | 'R'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'NOT'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'GT'
  | 'GE'
  | 'EQ'
  | 'NE'
  | 'LE'
  | 'LT'
  | 'JMP'
  | 'CAL'
  | 'RET'
  /** Type conversion used as an operator: `LD MW0` / `INT_TO_REAL` (CR := INT_TO_REAL(CR)). */
  | 'FN';

interface Mnemonic {
  base: Base;
  negate: boolean;
  /** Conditional on CR (C) or on NOT CR (CN). */
  condition: 'C' | 'CN' | null;
}

const LOGIC: Base[] = ['AND', 'OR', 'XOR'];
const ARITH: Record<string, string> = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: 'MOD' };
const COMPARE: Record<string, string> = {
  GT: '>',
  GE: '>=',
  EQ: '=',
  NE: '<>',
  LE: '<=',
  LT: '<',
};
/** Conversion functions usable as operators (same set as ST). */
const CONVERSION = /^(?:[A-Z]+_)?TO_(INT|DINT|REAL|LREAL|TIME)$/;

/** Operators that accept a deferred operation "OP(". */
const DEFERRABLE = new Set<Base>([
  ...LOGIC,
  ...(Object.keys(ARITH) as Base[]),
  ...(Object.keys(COMPARE) as Base[]),
]);

/** Every operator mnemonic with its modifiers (IEC 61131-3 table 52). */
export const IL_MNEMONICS: ReadonlyMap<string, Mnemonic> = (() => {
  const map = new Map<string, Mnemonic>();
  const add = (name: string, base: Base, negate = false, condition: Mnemonic['condition'] = null) =>
    map.set(name, { base, negate, condition });
  add('LD', 'LD');
  add('LDN', 'LD', true);
  add('ST', 'ST');
  add('STN', 'ST', true);
  add('S', 'S');
  add('R', 'R');
  for (const op of LOGIC) {
    add(op, op);
    add(`${op}N`, op, true);
  }
  add('NOT', 'NOT');
  for (const op of [...Object.keys(ARITH), ...Object.keys(COMPARE)]) add(op, op as Base);
  for (const op of ['JMP', 'CAL', 'RET'] as const) {
    add(op, op);
    add(`${op}C`, op, false, 'C');
    add(`${op}CN`, op, false, 'CN');
  }
  return map;
})();

interface Instruction {
  mnemonic: Mnemonic;
  /** Text as written (for messages). */
  name: string;
  deferred: boolean;
  operand?: Expression;
  /** Jump target. */
  label?: { name: string; range: Range };
  /** Function block call. */
  call?: { name: string; params: Param[] };
  /** The whole line (diagnostics) and its number (probes). */
  range: Range;
  line: number;
}

type Item =
  | { kind: 'label'; name: string; range: Range }
  | { kind: 'close'; range: Range; line: number }
  | ({ kind: 'instruction' } & Instruction);

interface Parsed {
  name?: string;
  vars: VarDecl[];
  items: Item[];
}

const span = (a: Range, b: Range): Range => ({ start: a.start, end: b.end });

export function compileIl(source: string, tags: readonly Tag[]): StCompileResult {
  const diagnostics: StDiagnostic[] = [];
  const error = (code: IlDiagnosticCode, range: Range, params: Record<string, string> = {}) =>
    diagnostics.push({ severity: 'error', code, params, range });

  let parsed: Parsed;
  try {
    parsed = parseIl(source, error);
  } catch (e) {
    if (e instanceof ParseError) {
      return {
        ir: null,
        diagnostics: [{ severity: 'error', code: e.code, params: e.params, range: e.range }],
        symbols: compileStProgram({ vars: [], body: [] }, tags).symbols,
      };
    }
    throw e;
  }

  const body = translate(parsed.items, error);
  const program: StProgram = {
    ...(parsed.name ? { name: parsed.name } : {}),
    vars: parsed.vars,
    body,
  };
  const result = compileStProgram(program, tags, {
    id: IL_NETWORK_ID,
    label: parsed.name ?? 'IL',
  });
  const all = [...diagnostics, ...result.diagnostics].sort(
    (a, b) => a.range.start.offset - b.range.start.offset,
  );
  return {
    ir: all.some((d) => d.severity === 'error') ? null : result.ir,
    diagnostics: all,
    symbols: result.symbols,
  };
}

// ------------------------------------------------------------------------------------ parsing

function parseIl(
  source: string,
  error: (code: IlDiagnosticCode, range: Range, params?: Record<string, string>) => void,
): Parsed {
  const tokens = tokenizeOrThrow(source);

  // Header: PROGRAM name and VAR blocks (same syntax as ST), parsed over all tokens.
  const header = createParser(tokens);
  let name: string | undefined;
  if (header.isKw('PROGRAM')) {
    header.next();
    name = header.expectIdent().text;
  }
  const vars: VarDecl[] = [];
  while (header.isKw('VAR')) vars.push(...header.varBlock());

  // The rest, one instruction per line.
  const rest = tokens.slice(header.position, -1);
  const lines: Token[][] = [];
  for (const t of rest) {
    const last = lines[lines.length - 1];
    if (last && last[0]!.range.start.line === t.range.start.line) last.push(t);
    else lines.push([t]);
  }

  const items: Item[] = [];
  let ended = false;
  for (const lineTokens of lines) {
    const first = lineTokens[0]!;
    const lineRange = span(first.range, lineTokens[lineTokens.length - 1]!.range);
    if (ended) {
      throw new ParseError('ST_SYNTAX', first.range, { expected: 'end', found: first.text });
    }
    const end: Token = {
      kind: 'eof',
      text: '',
      range: { start: lineRange.end, end: lineRange.end },
    };
    const p = createParser([...lineTokens, end]);
    const atEnd = () => p.peek().kind === 'eof';

    if (p.isKw('END_PROGRAM')) {
      p.next();
      if (p.isOp(';')) p.next();
      if (!atEnd()) p.fail('end');
      ended = true;
      continue;
    }
    // Label "NAME:" (possibly followed by an instruction on the same line).
    if (p.peek().kind === 'ident' && p.isOp(':', p.peek(1))) {
      const label = p.next();
      p.next();
      items.push({ kind: 'label', name: label.text.toUpperCase(), range: label.range });
      if (atEnd()) continue;
    }
    if (p.isOp(')')) {
      const close = p.next();
      items.push({ kind: 'close', range: close.range, line: close.range.start.line });
      if (!atEnd()) p.fail('end of line');
      continue;
    }
    const op = p.next();
    const text = op.text.toUpperCase();
    const mnemonic =
      op.kind === 'ident' || op.kind === 'keyword'
        ? (IL_MNEMONICS.get(text) ??
          (CONVERSION.test(text) ? { base: 'FN' as const, negate: false, condition: null } : null))
        : null;
    if (!mnemonic) {
      error('IL_UNKNOWN_OPERATOR', op.range, { name: op.text });
      continue;
    }
    const instruction: Instruction = {
      mnemonic,
      name: text,
      deferred: false,
      range: lineRange,
      line: op.range.start.line,
    };
    if (p.isOp('(') && mnemonic.base !== 'CAL') {
      p.next();
      if (!DEFERRABLE.has(mnemonic.base)) {
        error('IL_NO_DEFERRED', op.range, { name: text });
        continue;
      }
      instruction.deferred = true;
    }
    const base = mnemonic.base;
    if (base === 'JMP') {
      if (atEnd()) {
        error('IL_MISSING_OPERAND', op.range, { name: text });
        continue;
      }
      const target = p.expectIdent();
      instruction.label = { name: target.text.toUpperCase(), range: target.range };
    } else if (base === 'CAL') {
      if (atEnd()) {
        error('IL_MISSING_OPERAND', op.range, { name: text });
        continue;
      }
      const fb = p.expectIdent();
      const params = p.isOp('(') ? p.callParams() : [];
      instruction.call = { name: fb.text, params };
    } else if (base === 'NOT' || base === 'RET' || base === 'FN') {
      // no operand
    } else if (!atEnd()) {
      instruction.operand = p.expression();
      if ((base === 'ST' || base === 'S' || base === 'R') && instruction.operand.kind !== 'var') {
        error('IL_NOT_A_VARIABLE', instruction.operand.range, { name: text });
        continue;
      }
    } else if (!instruction.deferred) {
      error('IL_MISSING_OPERAND', op.range, { name: text });
      continue;
    }
    if (!atEnd()) {
      error('IL_UNEXPECTED_OPERAND', p.peek().range, { name: text });
      continue;
    }
    items.push({ kind: 'instruction', ...instruction });
  }
  return { ...(name ? { name } : {}), vars, items };
}

// -------------------------------------------------------------------------------- translation

interface Deferred {
  instruction: Instruction;
  saved: Expression | null;
}

function translate(
  items: Item[],
  error: (code: IlDiagnosticCode, range: Range, params?: Record<string, string>) => void,
): Statement[] {
  // Labels: position (index in items) of each one; also the implicit end for RET.
  const labels = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.kind !== 'label') return;
    if (labels.has(item.name)) error('IL_DUPLICATE_LABEL', item.range, { name: item.name });
    else labels.set(item.name, index);
  });
  const END = '$END';
  const flag = (label: string) => `il_jmp_${label === END ? 'end' : label}`;

  const groups: { guards: string[]; body: Statement[] }[] = [];
  const pending = new Set<string>();
  const emit = (statement: Statement) => {
    const guards = [...pending].sort();
    const last = groups[groups.length - 1];
    if (last && last.guards.join() === guards.join()) last.body.push(statement);
    else groups.push({ guards, body: [statement] });
  };

  let cr: Expression | null = null;
  const stack: Deferred[] = [];
  let temps = 0;
  const targets = new Set<string>();

  /** Freezes an expression in a temporary (when it reads memory that may change). */
  const freeze = (e: Expression | null, range: Range): Expression | null => {
    if (!e || e.kind === 'temp' || e.kind === 'bool' || e.kind === 'number' || e.kind === 'time')
      return e;
    const name = `il_cr_${temps++}`;
    emit({ kind: 'let', name, value: e, range });
    return { kind: 'temp', name, range: e.range };
  };
  const freezeAll = (range: Range) => {
    cr = freeze(cr, range);
    for (const d of stack) d.saved = freeze(d.saved, range);
  };
  const withProbe = (e: Expression, line: number): Expression => ({ ...e, probe: ilProbe(line) });
  const not = (e: Expression, range: Range): Expression => ({
    kind: 'unary',
    op: 'NOT',
    arg: e,
    range,
  });

  /** CR combined with an operand by a logic, arithmetic or comparison operator. */
  const combine = (
    left: Expression,
    base: Base,
    negate: boolean,
    right: Expression,
    range: Range,
  ) => {
    const r = negate ? not(right, right.range) : right;
    const op = LOGIC.includes(base) ? base : (ARITH[base] ?? COMPARE[base]!);
    return { kind: 'binary', op, left, right: r, range } satisfies Expression;
  };
  const needCr = (instruction: Instruction): Expression | null => {
    if (!cr) error('IL_NEEDS_LOAD', instruction.range, { name: instruction.name });
    return cr;
  };

  items.forEach((item, index) => {
    if (item.kind === 'label') {
      if (pending.has(item.name)) {
        pending.delete(item.name);
        cr = null; // reached by a jump: the accumulator is unknown here
      }
      return;
    }
    if (item.kind === 'close') {
      const d = stack.pop();
      if (!d) {
        error('IL_UNEXPECTED_PAREN', item.range);
        return;
      }
      const inner = cr;
      if (!inner) error('IL_NEEDS_LOAD', item.range, { name: ')' });
      cr =
        d.saved && inner
          ? withProbe(
              combine(
                d.saved,
                d.instruction.mnemonic.base,
                d.instruction.mnemonic.negate,
                inner,
                span(d.instruction.range, item.range),
              ),
              item.line,
            )
          : null;
      return;
    }

    const { mnemonic, line, range } = item;
    const { base, negate } = mnemonic;
    const operand = item.operand;
    switch (base) {
      case 'LD':
        cr = withProbe(negate ? not(operand!, range) : operand!, line);
        return;
      case 'ST':
      case 'S':
      case 'R': {
        if (!needCr(item)) return;
        freezeAll(range);
        const value = withProbe(cr!, line);
        const target = operand as Extract<Expression, { kind: 'var' }>;
        if (base === 'ST') {
          emit({ kind: 'assign', target, value: negate ? not(value, range) : value, range });
        } else {
          emit({
            kind: 'if',
            branches: [
              {
                condition: value,
                body: [
                  {
                    kind: 'assign',
                    target,
                    value: { kind: 'bool', value: base === 'S', range },
                    range,
                  },
                ],
              },
            ],
            range,
          });
        }
        return;
      }
      case 'NOT':
        if (needCr(item)) cr = withProbe(not(cr!, range), line);
        return;
      case 'FN':
        if (needCr(item))
          cr = withProbe({ kind: 'call', name: item.name, args: [cr!], range }, line);
        return;
      case 'JMP':
      case 'RET': {
        const label = base === 'RET' ? END : item.label!.name;
        if (base === 'JMP') {
          const at = labels.get(label);
          if (at === undefined) {
            error('IL_UNKNOWN_LABEL', item.label!.range, { name: item.label!.name });
            return;
          }
          if (at < index) {
            error('IL_BACKWARD_JUMP', item.label!.range, { name: item.label!.name });
            return;
          }
        }
        if (stack.length) {
          error('IL_UNCLOSED_PAREN', stack[stack.length - 1]!.instruction.range);
          return;
        }
        let condition: Expression = { kind: 'bool', value: true, range };
        if (mnemonic.condition) {
          if (!needCr(item)) return;
          freezeAll(range);
          condition = withProbe(cr!, line);
          if (mnemonic.condition === 'CN') condition = not(condition, range);
        }
        targets.add(label);
        const name = flag(label);
        emit({
          kind: 'let',
          name,
          value: {
            kind: 'binary',
            op: 'OR',
            left: { kind: 'temp', name, range },
            right: condition,
            range,
          },
          range,
        });
        pending.add(label);
        if (!mnemonic.condition) cr = null; // unreachable until the next label
        return;
      }
      case 'CAL': {
        let condition: Expression | null = null;
        if (mnemonic.condition) {
          if (!needCr(item)) return;
          freezeAll(range);
          condition = withProbe(cr!, line);
          if (mnemonic.condition === 'CN') condition = not(condition, range);
        } else {
          freezeAll(range);
        }
        const call: Statement = {
          kind: 'fbcall',
          name: item.call!.name,
          params: item.call!.params,
          range,
        };
        emit(condition ? { kind: 'if', branches: [{ condition, body: [call] }], range } : call);
        cr = null;
        return;
      }
      default: {
        // Logic, arithmetic and comparison operators.
        if (item.deferred) {
          stack.push({ instruction: item, saved: cr });
          if (!cr) error('IL_NEEDS_LOAD', range, { name: item.name });
          cr = operand ? withProbe(operand, line) : null;
          return;
        }
        if (!needCr(item)) return;
        cr = withProbe(combine(cr!, base, negate, operand!, range), line);
      }
    }
  });
  for (const d of stack) error('IL_UNCLOSED_PAREN', d.instruction.range);

  const init: Statement[] = [...targets].map((label) => {
    const range = items[0]?.range ?? ZERO;
    return { kind: 'let', name: flag(label), value: { kind: 'bool', value: false, range }, range };
  });
  const body: Statement[] = [...init];
  for (const g of groups) {
    if (g.guards.length === 0) {
      body.push(...g.body);
      continue;
    }
    const range = g.body[0]!.range;
    const skipped = g.guards
      .map((label): Expression => ({ kind: 'temp', name: flag(label), range }))
      .reduce((a, b) => ({ kind: 'binary', op: 'OR', left: a, right: b, range }));
    body.push({
      kind: 'if',
      branches: [{ condition: { kind: 'unary', op: 'NOT', arg: skipped, range }, body: g.body }],
      range,
    });
  }
  return body;
}

const ZERO: Range = {
  start: { line: 1, col: 1, offset: 0 },
  end: { line: 1, col: 1, offset: 0 },
};
