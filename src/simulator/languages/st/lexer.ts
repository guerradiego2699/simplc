/**
 * Structured Text lexer (IEC 61131-3). Keywords are case-insensitive. Comments: (* … *),
 * /* … *\/ and // to end of line. Positions are 1-based lines and columns for the editor.
 */

export interface Pos {
  line: number;
  col: number;
  offset: number;
}

export interface Range {
  start: Pos;
  end: Pos;
}

export type TokenKind = 'ident' | 'keyword' | 'number' | 'time' | 'address' | 'op' | 'eof';

export interface Token {
  kind: TokenKind;
  /** Upper-cased for keywords; original text otherwise. */
  text: string;
  range: Range;
}

export const KEYWORDS = new Set([
  'PROGRAM',
  'END_PROGRAM',
  'VAR',
  'END_VAR',
  'IF',
  'THEN',
  'ELSIF',
  'ELSE',
  'END_IF',
  'CASE',
  'OF',
  'END_CASE',
  'FOR',
  'TO',
  'BY',
  'DO',
  'END_FOR',
  'WHILE',
  'END_WHILE',
  'REPEAT',
  'UNTIL',
  'END_REPEAT',
  'EXIT',
  'RETURN',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'MOD',
  'TRUE',
  'FALSE',
]);

/** Multi-character operators first, so ':=' wins over ':'. */
const OPERATORS = [
  ':=',
  '=>',
  '<=',
  '>=',
  '<>',
  '**',
  '..',
  '+',
  '-',
  '*',
  '/',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  ',',
  ';',
  ':',
  '.',
  '&',
];

export class LexError extends Error {
  readonly range: Range;
  readonly params: Record<string, string>;
  constructor(code: 'ST_BAD_CHAR' | 'ST_UNCLOSED_COMMENT', range: Range, params = {}) {
    super(code);
    this.range = range;
    this.params = params;
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const pos = (): Pos => ({ line, col, offset: i });
  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const push = (kind: TokenKind, text: string, start: Pos) =>
    tokens.push({ kind, text, range: { start, end: pos() } });

  while (i < source.length) {
    const ch = source[i] ?? '';
    const rest = source.slice(i);

    if (/\s/.test(ch)) {
      advance(1);
      continue;
    }
    // Comments
    if (rest.startsWith('(*') || rest.startsWith('/*')) {
      const close = rest.startsWith('(*') ? '*)' : '*/';
      const start = pos();
      const end = source.indexOf(close, i + 2);
      if (end < 0) throw new LexError('ST_UNCLOSED_COMMENT', { start, end: start });
      advance(end + 2 - i);
      continue;
    }
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', i);
      advance((end < 0 ? source.length : end) - i);
      continue;
    }

    const start = pos();

    // Time literals: T#5s, TIME#1m30s, t#-250ms
    const time = /^(?:T|TIME)#-?[0-9A-Za-z_.]+/i.exec(rest);
    if (time) {
      advance(time[0].length);
      push('time', time[0], start);
      continue;
    }
    // Typed literals INT#5, REAL#1.5 → keep the value part only
    const typed = /^(?:INT|DINT|REAL|LREAL)#/i.exec(rest);
    if (typed) {
      advance(typed[0].length);
      continue;
    }
    // Direct addresses: %IX0.0, %QW1, %MD3
    const direct = /^%[A-Za-z]{1,2}\d+(?:\.\d+)?/.exec(rest);
    if (direct) {
      advance(direct[0].length);
      push('address', direct[0], start);
      continue;
    }
    // Numbers: 16#FF, 2#1010, 1_000, 1.5, 1.0E3 (but not "1..5" ranges)
    const num =
      /^(?:(?:2|8|16)#[0-9A-Fa-f_]+|\d[\d_]*(?:\.\d[\d_]*(?:[eE][+-]?\d+)?|[eE][+-]?\d+)?)/.exec(
        rest,
      );
    if (num && /\d/.test(ch)) {
      advance(num[0].length);
      push('number', num[0], start);
      continue;
    }
    // Identifiers and keywords
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (ident) {
      advance(ident[0].length);
      const upper = ident[0].toUpperCase();
      if (KEYWORDS.has(upper)) push('keyword', upper, start);
      else push('ident', ident[0], start);
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      advance(op.length);
      push('op', op, start);
      continue;
    }
    advance(1);
    throw new LexError('ST_BAD_CHAR', { start, end: pos() }, { char: ch });
  }
  tokens.push({ kind: 'eof', text: '', range: { start: pos(), end: pos() } });
  return tokens;
}
