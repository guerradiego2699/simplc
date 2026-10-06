/**
 * Structured Text parser: tokens → AST. Stops at the first syntax error (reported with its
 * range); semantic checks happen in the compiler.
 *
 * Operator precedence (IEC 61131-3, lowest first): OR, XOR, AND/&, = <>, < > <= >=, + -,
 * * / MOD, **, unary - and NOT.
 */
import type {
  CaseBranch,
  Expression,
  Param,
  Statement,
  StProgram,
  StType,
  VarDecl,
  VarRef,
} from './ast';
import { ST_TYPES } from './ast';
import { LexError, tokenize, type Range, type Token } from './lexer';

export class ParseError extends Error {
  readonly code: string;
  readonly range: Range;
  readonly params: Record<string, string>;
  constructor(code: string, range: Range, params: Record<string, string> = {}) {
    super(code);
    this.code = code;
    this.range = range;
    this.params = params;
  }
}

export function parseSt(source: string): StProgram {
  return createParser(tokenizeOrThrow(source)).program();
}

/** Tokenizes, turning lexer errors into ParseErrors. */
export function tokenizeOrThrow(source: string): Token[] {
  try {
    return tokenize(source);
  } catch (e) {
    if (e instanceof LexError) throw new ParseError(e.message, e.range, e.params);
    throw e;
  }
}

export type StParser = ReturnType<typeof createParser>;

/**
 * Recursive-descent parser over a token list. Besides `program()` (a whole ST program) it exposes
 * the pieces the IL parser reuses: expressions, variable references, VAR blocks and the
 * parameter list of a function block call.
 */
export function createParser(tokens: Token[]) {
  let i = 0;

  const peek = (k = 0): Token => tokens[Math.min(i + k, tokens.length - 1)]!;
  const next = (): Token => tokens[i++]!;
  const isKw = (kw: string, t = peek()) => t.kind === 'keyword' && t.text === kw;
  const isOp = (op: string, t = peek()) => t.kind === 'op' && t.text === op;
  const span = (a: Range, b: Range): Range => ({ start: a.start, end: b.end });

  const fail = (expected: string): never => {
    const t = peek();
    throw new ParseError('ST_SYNTAX', t.range, { expected, found: t.text });
  };
  const expectKw = (kw: string) => (isKw(kw) ? next() : fail(kw));
  const expectOp = (op: string) => (isOp(op) ? next() : fail(op));
  const expectIdent = (): Token => (peek().kind === 'ident' ? next() : fail('identifier'));
  /** Block terminators like END_IF may be followed by an optional ';'. */
  const optionalSemicolon = () => {
    if (isOp(';')) next();
  };

  // ---------------------------------------------------------------------------- expressions

  const varRef = (): VarRef => {
    const t = peek();
    if (t.kind === 'address') {
      next();
      return { kind: 'var', name: t.text, range: t.range };
    }
    const id = expectIdent();
    // "I0.3" lexes as I0 . 3 → a bit address
    if (isOp('.') && peek(1).kind === 'number' && /^\d+$/.test(peek(1).text)) {
      next();
      const bit = next();
      return { kind: 'var', name: `${id.text}.${bit.text}`, range: span(id.range, bit.range) };
    }
    if (isOp('.') && peek(1).kind === 'ident') {
      next();
      const member = next();
      return {
        kind: 'var',
        name: id.text,
        member: member.text.toUpperCase(),
        range: span(id.range, member.range),
      };
    }
    return { kind: 'var', name: id.text, range: id.range };
  };

  const primary = (): Expression => {
    const t = peek();
    if (isOp('(')) {
      next();
      const e = expression();
      expectOp(')');
      return e;
    }
    if (isKw('TRUE') || isKw('FALSE')) {
      next();
      return { kind: 'bool', value: t.text === 'TRUE', range: t.range };
    }
    if (t.kind === 'number') {
      next();
      return { kind: 'number', text: t.text, range: t.range };
    }
    if (t.kind === 'time') {
      next();
      return { kind: 'time', text: t.text, range: t.range };
    }
    // Function call: NAME(arg, …)
    if (t.kind === 'ident' && isOp('(', peek(1))) {
      next();
      next();
      const args: Expression[] = [];
      if (!isOp(')')) {
        args.push(expression());
        while (isOp(',')) {
          next();
          args.push(expression());
        }
      }
      const close = expectOp(')');
      return { kind: 'call', name: t.text.toUpperCase(), args, range: span(t.range, close.range) };
    }
    if (t.kind === 'ident' || t.kind === 'address') return varRef();
    return fail('expression');
  };

  const unary = (): Expression => {
    const t = peek();
    if (isKw('NOT') || isOp('-') || isOp('+')) {
      next();
      const arg = unary();
      if (t.text === '+') return arg;
      return { kind: 'unary', op: t.text as 'NOT' | '-', arg, range: span(t.range, arg.range) };
    }
    return power();
  };

  const power = (): Expression => {
    let left = primary();
    while (isOp('**')) {
      next();
      const right = primary();
      left = { kind: 'binary', op: '**', left, right, range: span(left.range, right.range) };
    }
    return left;
  };

  const binaryLevel = (ops: string[], operand: () => Expression) => (): Expression => {
    let left = operand();
    for (;;) {
      const t = peek();
      const op = t.kind === 'op' || t.kind === 'keyword' ? t.text : '';
      if (!ops.includes(op)) return left;
      next();
      const right = operand();
      left = {
        kind: 'binary',
        op: op === '&' ? 'AND' : op,
        left,
        right,
        range: span(left.range, right.range),
      };
    }
  };

  const term = binaryLevel(['*', '/', 'MOD'], unary);
  const sum = binaryLevel(['+', '-'], term);
  const comparison = binaryLevel(['<', '>', '<=', '>='], sum);
  const equality = binaryLevel(['=', '<>'], comparison);
  const andExpr = binaryLevel(['AND', '&'], equality);
  const xorExpr = binaryLevel(['XOR'], andExpr);
  const expression = binaryLevel(['OR'], xorExpr);

  /** `(PARAM := value, …)` of a function block call; returns the parameters. */
  const callParams = (): Param[] => {
    expectOp('(');
    const params: Param[] = [];
    if (!isOp(')')) {
      do {
        if (params.length) next(); // the comma
        const name = expectIdent();
        if (!isOp(':=')) fail(':=');
        next();
        const value = expression();
        params.push({
          name: name.text.toUpperCase(),
          value,
          range: span(name.range, value.range),
        });
      } while (isOp(','));
    }
    expectOp(')');
    return params;
  };

  // ----------------------------------------------------------------------------- statements

  const statementsUntil = (...terminators: string[]): Statement[] => {
    const list: Statement[] = [];
    while (!terminators.some((k) => isKw(k)) && peek().kind !== 'eof') {
      const s = statement();
      if (s) list.push(s);
    }
    return list;
  };

  const statement = (): Statement | null => {
    const t = peek();
    if (isOp(';')) {
      next();
      return null;
    }
    if (isKw('IF')) return ifStatement();
    if (isKw('CASE')) return caseStatement();
    if (isKw('FOR')) return forStatement();
    if (isKw('WHILE')) {
      next();
      const condition = expression();
      expectKw('DO');
      const body = statementsUntil('END_WHILE');
      const end = expectKw('END_WHILE');
      optionalSemicolon();
      return { kind: 'while', condition, body, range: span(t.range, end.range) };
    }
    if (isKw('REPEAT')) {
      next();
      const body = statementsUntil('UNTIL');
      expectKw('UNTIL');
      const until = expression();
      const end = expectKw('END_REPEAT');
      optionalSemicolon();
      return { kind: 'repeat', body, until, range: span(t.range, end.range) };
    }
    if (isKw('EXIT') || isKw('RETURN')) {
      next();
      const end = expectOp(';');
      return { kind: t.text === 'EXIT' ? 'exit' : 'return', range: span(t.range, end.range) };
    }
    // Function block call: NAME(PARAM := value, …);
    if (t.kind === 'ident' && isOp('(', peek(1))) {
      next();
      const params = callParams();
      const end = expectOp(';');
      return { kind: 'fbcall', name: t.text, params, range: span(t.range, end.range) };
    }
    if (t.kind === 'ident' || t.kind === 'address') {
      const target = varRef();
      if (!isOp(':=')) fail(':=');
      next();
      const value = expression();
      const end = expectOp(';');
      return { kind: 'assign', target, value, range: span(t.range, end.range) };
    }
    return fail('statement');
  };

  const ifStatement = (): Statement => {
    const start = next();
    const branches: { condition: Expression; body: Statement[] }[] = [];
    const condition = expression();
    expectKw('THEN');
    branches.push({ condition, body: statementsUntil('ELSIF', 'ELSE', 'END_IF') });
    while (isKw('ELSIF')) {
      next();
      const c = expression();
      expectKw('THEN');
      branches.push({ condition: c, body: statementsUntil('ELSIF', 'ELSE', 'END_IF') });
    }
    let elseBody: Statement[] | undefined;
    if (isKw('ELSE')) {
      next();
      elseBody = statementsUntil('END_IF');
    }
    const end = expectKw('END_IF');
    optionalSemicolon();
    return {
      kind: 'if',
      branches,
      ...(elseBody ? { else: elseBody } : {}),
      range: span(start.range, end.range),
    };
  };

  /** True when the tokens ahead look like a CASE label list followed by ':'. */
  const atCaseLabel = (): boolean => {
    let k = 0;
    for (;;) {
      const t = peek(k);
      if (t.kind === 'eof') return false;
      if (isOp(':', t)) return true;
      if (isOp(';', t) || isOp(':=', t) || t.kind === 'keyword') return false;
      k++;
    }
  };

  const caseStatement = (): Statement => {
    const start = next();
    const selector = expression();
    expectKw('OF');
    const branches: CaseBranch[] = [];
    while (!isKw('ELSE') && !isKw('END_CASE') && peek().kind !== 'eof') {
      const labels: CaseBranch['labels'] = [];
      do {
        if (labels.length) next(); // the comma
        const from = sum();
        if (isOp('..')) {
          next();
          labels.push({ from, to: sum() });
        } else {
          labels.push({ from });
        }
      } while (isOp(','));
      expectOp(':');
      const body: Statement[] = [];
      while (!isKw('ELSE') && !isKw('END_CASE') && !atCaseLabel() && peek().kind !== 'eof') {
        const s = statement();
        if (s) body.push(s);
      }
      branches.push({ labels, body });
    }
    let elseBody: Statement[] | undefined;
    if (isKw('ELSE')) {
      next();
      elseBody = statementsUntil('END_CASE');
    }
    const end = expectKw('END_CASE');
    optionalSemicolon();
    return {
      kind: 'case',
      selector,
      branches,
      ...(elseBody ? { else: elseBody } : {}),
      range: span(start.range, end.range),
    };
  };

  const forStatement = (): Statement => {
    const start = next();
    const variable = varRef();
    expectOp(':=');
    const from = expression();
    expectKw('TO');
    const to = expression();
    let by: Expression | undefined;
    if (isKw('BY')) {
      next();
      by = expression();
    }
    expectKw('DO');
    const body = statementsUntil('END_FOR');
    const end = expectKw('END_FOR');
    optionalSemicolon();
    return {
      kind: 'for',
      variable,
      from,
      to,
      ...(by ? { by } : {}),
      body,
      range: span(start.range, end.range),
    };
  };

  // -------------------------------------------------------------------------------- program

  const varBlock = (): VarDecl[] => {
    expectKw('VAR');
    const decls: VarDecl[] = [];
    while (!isKw('END_VAR')) {
      const names: Token[] = [expectIdent()];
      while (isOp(',')) {
        next();
        names.push(expectIdent());
      }
      expectOp(':');
      const typeToken = peek();
      if (typeToken.kind !== 'ident' && typeToken.kind !== 'keyword') fail('type');
      next();
      const type = typeToken.text.toUpperCase();
      if (!ST_TYPES.includes(type as StType)) {
        throw new ParseError('ST_UNKNOWN_TYPE', typeToken.range, { type: typeToken.text });
      }
      let init: Expression | undefined;
      if (isOp(':=')) {
        next();
        init = expression();
      }
      const end = expectOp(';');
      for (const n of names) {
        decls.push({
          name: n.text,
          type: type as StType,
          ...(init ? { init } : {}),
          range: span(n.range, end.range),
        });
      }
    }
    next();
    optionalSemicolon();
    return decls;
  };

  const program = (): StProgram => {
    let name: string | undefined;
    if (isKw('PROGRAM')) {
      next();
      name = expectIdent().text;
    }
    const vars: VarDecl[] = [];
    while (isKw('VAR')) vars.push(...varBlock());
    const body = statementsUntil('END_PROGRAM');
    if (name !== undefined || isKw('END_PROGRAM')) {
      expectKw('END_PROGRAM');
      optionalSemicolon();
    }
    if (peek().kind !== 'eof') fail('end');
    return { ...(name ? { name } : {}), vars, body };
  };

  return {
    peek,
    next,
    isKw,
    isOp,
    fail,
    span,
    expectOp,
    expectIdent,
    expression,
    varRef,
    varBlock,
    callParams,
    program,
    /** Index of the next token (to detect progress). */
    get position() {
      return i;
    },
  };
}
