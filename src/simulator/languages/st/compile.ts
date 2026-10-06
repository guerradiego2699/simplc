/**
 * Structured Text → IR compiler.
 *
 * Names are resolved (case-insensitively) in this order: VAR locals, the variable table (tags),
 * direct addresses (I0.0, %IX0.0, MW10, T0.ET…). The whole program is one IR network.
 *
 * VAR declarations:
 * - BOOL / INT / REAL / TIME locals get a free address from the top of memory (M31.7 down,
 *   MW63 down, MD31 down), so they keep their value between scans like PROGRAM variables.
 *   `x : INT := 5;` initialises on the first scan.
 * - TON/TOF/TP and CTU/CTD/CTUD declare a timer/counter instance. If the name is a tag or an
 *   address of a timer/counter (CICLO → T0, or T0 itself) that instance is used; otherwise a
 *   free one is taken (T31 down, C31 down).
 * - R_TRIG / F_TRIG are edge detectors; `name(CLK := x);` then read `name.Q`.
 */
import {
  analyze,
  parseAddress,
  parseLiteral,
  parseTime,
  SYSTEM_BITS,
  type DataType,
} from '@/simulator/engine';
import { DEFAULT_LAYOUT } from '@/simulator/engine/memory';
import type { ArithOp, CompareOp, Expr, IrProgram, Stmt } from '@/simulator/ir/types';
import { resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import type { Expression, Statement, StProgram, StType, VarDecl, VarRef } from './ast';
import type { Range } from './lexer';
import { ParseError, parseSt } from './parser';

export type StDiagnosticCode =
  | 'ST_SYNTAX'
  | 'ST_BAD_CHAR'
  | 'ST_UNCLOSED_COMMENT'
  | 'ST_UNKNOWN_TYPE'
  | 'ST_UNKNOWN_NAME'
  | 'ST_UNKNOWN_MEMBER'
  | 'ST_NOT_A_VALUE'
  | 'ST_NOT_WRITABLE'
  | 'ST_NOT_CALLABLE'
  | 'ST_UNDECLARED_FB'
  | 'ST_MISSING_PARAM'
  | 'ST_UNKNOWN_PARAM'
  | 'ST_DUPLICATE_PARAM'
  | 'ST_DUPLICATE_CALL'
  | 'ST_DUPLICATE_NAME'
  | 'ST_NAME_CONFLICT'
  | 'ST_NO_FREE_MEMORY'
  | 'ST_BAD_INIT'
  | 'ST_BAD_LITERAL'
  | 'ST_UNKNOWN_FUNCTION'
  | 'ST_ARGUMENT_COUNT'
  | 'ST_UNSUPPORTED'
  | 'ST_CASE_LABEL'
  | 'ST_FOR_VARIABLE'
  | 'ST_FOR_STEP'
  | 'ST_EXIT_OUTSIDE_LOOP';

export interface StDiagnostic {
  severity: 'error' | 'warning';
  /** ST codes, or engine codes (TYPE_MISMATCH, INVALID_ADDRESS…) found by analyze(). */
  code: string;
  params: Record<string, string | number>;
  range: Range;
}

/** What a name means in the program (also used for autocompletion and live values). */
export interface StSymbol {
  name: string;
  origin: 'local' | 'tag';
  type: StType | DataType;
  /** Memory address (locals and tags). Edge detectors have none. */
  address?: string;
  comment?: string;
}

export interface StCompileResult {
  ir: IrProgram | null;
  diagnostics: StDiagnostic[];
  symbols: StSymbol[];
}

export const ST_NETWORK_ID = 'st';

const TIMER_TYPES = ['TON', 'TOF', 'TP'] as const;
const COUNTER_TYPES = ['CTU', 'CTD', 'CTUD'] as const;
const EDGE_TYPES = ['R_TRIG', 'F_TRIG'] as const;
const isTimer = (t: StType) => (TIMER_TYPES as readonly string[]).includes(t);
const isCounter = (t: StType) => (COUNTER_TYPES as readonly string[]).includes(t);
const isEdge = (t: StType) => (EDGE_TYPES as readonly string[]).includes(t);

/** Parameters of each function block: [name, required]. */
const FB_PARAMS: Record<string, [string, boolean][]> = {
  TON: [
    ['IN', true],
    ['PT', true],
  ],
  TOF: [
    ['IN', true],
    ['PT', true],
  ],
  TP: [
    ['IN', true],
    ['PT', true],
  ],
  CTU: [
    ['CU', true],
    ['R', false],
    ['PV', true],
  ],
  CTD: [
    ['CD', true],
    ['LD', false],
    ['PV', true],
  ],
  CTUD: [
    ['CU', true],
    ['CD', true],
    ['R', false],
    ['LD', false],
    ['PV', true],
  ],
  R_TRIG: [['CLK', true]],
  F_TRIG: [['CLK', true]],
};

interface Local {
  decl: VarDecl;
  /** Memory address for data and timer/counter instances. */
  address?: string;
  /** Temporary holding Q of an edge detector. */
  edgeTemp?: string;
  called?: boolean;
}

const ZERO_RANGE: Range = {
  start: { line: 1, col: 1, offset: 0 },
  end: { line: 1, col: 1, offset: 0 },
};

export function compileSt(source: string, tags: readonly Tag[]): StCompileResult {
  let program: StProgram;
  try {
    program = parseSt(source);
  } catch (e) {
    if (e instanceof ParseError) {
      return {
        ir: null,
        diagnostics: [{ severity: 'error', code: e.code, params: e.params, range: e.range }],
        symbols: tagSymbols(tags),
      };
    }
    throw e;
  }
  return compileStProgram(program, tags);
}

/**
 * Compiles an already-built AST. IL and SFC translate to this AST (they may use `temp`, `let`
 * and `probe`), so they share name resolution, VAR blocks, FB calls and type checks with ST.
 * Diagnostics keep the AST's range objects, so callers can map them back by identity.
 */
export function compileStProgram(
  program: StProgram,
  tags: readonly Tag[],
  network: { id: string; label: string } = { id: ST_NETWORK_ID, label: program.name ?? 'ST' },
): StCompileResult {
  return new Compiler(program, tags, network).run();
}

function tagSymbols(tags: readonly Tag[]): StSymbol[] {
  return tags.map((t) => {
    const ref = parseAddress(t.address);
    return {
      name: t.name,
      origin: 'tag' as const,
      type: ref ? typeOf(ref) : 'BOOL',
      address: t.address,
      comment: t.comment,
    };
  });
}

function typeOf(ref: NonNullable<ReturnType<typeof parseAddress>>): DataType {
  switch (ref.kind) {
    case 'bit':
      return 'BOOL';
    case 'word':
      return ref.area === 'MD' ? 'REAL' : 'INT';
    case 'timer':
      return ref.member === 'ET' || ref.member === 'PT' ? 'TIME' : 'BOOL';
    case 'counter':
      return ref.member === 'CV' || ref.member === 'PV' ? 'INT' : 'BOOL';
  }
}

class Compiler {
  private readonly diagnostics: StDiagnostic[] = [];
  private readonly ranges: Range[] = [];
  private readonly locals = new Map<string, Local>();
  private loopDepth = 0;
  private tempCount = 0;
  private readonly program: StProgram;
  private readonly tags: readonly Tag[];
  private readonly network: { id: string; label: string };

  constructor(program: StProgram, tags: readonly Tag[], network: { id: string; label: string }) {
    this.program = program;
    this.tags = tags;
    this.network = network;
  }

  run(): StCompileResult {
    const body: Stmt[] = [];
    this.declare(body);
    body.push(...this.block(this.program.body));

    const ir: IrProgram = {
      version: 1,
      networks: [{ id: this.network.id, label: this.network.label, body }],
    };

    for (const d of analyze(ir, DEFAULT_LAYOUT, { warnDuplicateOutputs: false })) {
      const index = d.source?.startsWith('n') ? Number(d.source.slice(1)) : NaN;
      this.diagnostics.push({
        severity: d.severity,
        code: d.code,
        params: d.params,
        range: this.ranges[index] ?? ZERO_RANGE,
      });
    }

    const hasErrors = this.diagnostics.some((d) => d.severity === 'error');
    return {
      ir: hasErrors ? null : ir,
      diagnostics: dedupe(this.diagnostics),
      symbols: [...tagSymbols(this.tags), ...this.localSymbols()],
    };
  }

  // ------------------------------------------------------------------------------- helpers

  private error(
    code: StDiagnosticCode,
    range: Range,
    params: Record<string, string | number> = {},
  ) {
    this.diagnostics.push({ severity: 'error', code, params, range });
  }

  /** Registers a source range and returns the IR `source` id pointing at it. */
  private src(range: Range): { source: string } {
    this.ranges.push(range);
    return { source: `n${this.ranges.length - 1}` };
  }

  private newTemp(prefix: string) {
    return `${prefix}_${this.tempCount++}`;
  }

  private localSymbols(): StSymbol[] {
    return [...this.locals.values()].map((l) => ({
      name: l.decl.name,
      origin: 'local' as const,
      type: l.decl.type,
      ...(l.address ? { address: l.address } : {}),
    }));
  }

  // ---------------------------------------------------------------------------- VAR blocks

  /** Addresses referenced anywhere (tags and direct addresses) — locals must avoid them. */
  private usedAddresses(): Set<string> {
    const used = new Set<string>();
    const add = (text: string) => {
      const ref = parseAddress(text);
      if (!ref) return;
      if (ref.kind === 'bit') used.add(`${ref.area}${ref.byte}.${ref.bit}`);
      else if (ref.kind === 'word') used.add(`${ref.area}${ref.index}`);
      else used.add(`${ref.kind === 'timer' ? 'T' : 'C'}${ref.index}`);
    };
    for (const t of this.tags) add(t.address);
    const visitExpr = (e: Expression): void => {
      switch (e.kind) {
        case 'var':
          add(e.name);
          break;
        case 'unary':
          visitExpr(e.arg);
          break;
        case 'binary':
          visitExpr(e.left);
          visitExpr(e.right);
          break;
        case 'call':
          e.args.forEach(visitExpr);
          break;
        default:
          break;
      }
    };
    const visit = (s: Statement): void => {
      switch (s.kind) {
        case 'assign':
          add(s.target.name);
          visitExpr(s.value);
          break;
        case 'fbcall':
          add(s.name);
          s.params.forEach((p) => visitExpr(p.value));
          break;
        case 'let':
          visitExpr(s.value);
          break;
        case 'if':
          s.branches.forEach((b) => {
            visitExpr(b.condition);
            b.body.forEach(visit);
          });
          s.else?.forEach(visit);
          break;
        case 'case':
          visitExpr(s.selector);
          s.branches.forEach((b) => b.body.forEach(visit));
          s.else?.forEach(visit);
          break;
        case 'for':
          add(s.variable.name);
          [s.from, s.to, ...(s.by ? [s.by] : [])].forEach(visitExpr);
          s.body.forEach(visit);
          break;
        case 'while':
        case 'repeat':
          visitExpr(s.kind === 'while' ? s.condition : s.until);
          s.body.forEach(visit);
          break;
        default:
          break;
      }
    };
    this.program.body.forEach(visit);
    for (const d of this.program.vars) add(d.name);
    return used;
  }

  private declare(body: Stmt[]) {
    const used = this.usedAddresses();
    const next = {
      bit: DEFAULT_LAYOUT.markerBytes * 8 - 1,
      mw: DEFAULT_LAYOUT.memoryWords - 1,
      md: DEFAULT_LAYOUT.realWords - 1,
      timer: DEFAULT_LAYOUT.timers - 1,
      counter: DEFAULT_LAYOUT.counters - 1,
    };
    const take = (kind: keyof typeof next, format: (i: number) => string): string | null => {
      while (next[kind] >= 0) {
        const address = format(next[kind]--);
        const key = kind === 'timer' ? address : kind === 'counter' ? address : address;
        if (!used.has(key)) {
          used.add(key);
          return address;
        }
      }
      return null;
    };

    const inits: Stmt[] = [];
    for (const decl of this.program.vars) {
      const key = decl.name.toUpperCase();
      if (this.locals.has(key)) {
        this.error('ST_DUPLICATE_NAME', decl.range, { name: decl.name });
        continue;
      }
      const resolved = resolveOperand(decl.name, this.tags);
      const ref = resolved.ok ? parseAddress(resolved.address) : null;
      const local: Local = { decl };

      if (isTimer(decl.type) || isCounter(decl.type)) {
        const kind = isTimer(decl.type) ? 'timer' : 'counter';
        if (ref) {
          if (ref.kind !== kind) {
            this.error('ST_NAME_CONFLICT', decl.range, { name: decl.name });
            continue;
          }
          local.address = `${kind === 'timer' ? 'T' : 'C'}${ref.index}`;
        } else {
          const a = take(kind, (i) => `${kind === 'timer' ? 'T' : 'C'}${i}`);
          if (!a) {
            this.error('ST_NO_FREE_MEMORY', decl.range, { name: decl.name });
            continue;
          }
          local.address = a;
        }
        if (decl.init) this.error('ST_BAD_INIT', decl.init.range, { name: decl.name });
      } else if (isEdge(decl.type)) {
        if (resolved.ok) {
          this.error('ST_NAME_CONFLICT', decl.range, { name: decl.name });
          continue;
        }
        local.edgeTemp = `edge_${key}`;
        body.push({ kind: 'let', name: local.edgeTemp, value: { kind: 'const', value: false } });
        if (decl.init) this.error('ST_BAD_INIT', decl.init.range, { name: decl.name });
      } else {
        if (resolved.ok) {
          this.error('ST_NAME_CONFLICT', decl.range, { name: decl.name });
          continue;
        }
        const a =
          decl.type === 'BOOL'
            ? take('bit', (i) => `M${Math.floor(i / 8)}.${i % 8}`)
            : decl.type === 'INT'
              ? take('mw', (i) => `MW${i}`)
              : take('md', (i) => `MD${i}`);
        if (!a) {
          this.error('ST_NO_FREE_MEMORY', decl.range, { name: decl.name });
          continue;
        }
        local.address = a;
        if (decl.init) {
          const value = this.expr(decl.init);
          if (value) inits.push({ kind: 'assign', target: a, value, ...this.src(decl.init.range) });
        }
      }
      this.locals.set(key, local);
    }
    if (inits.length) {
      body.push({
        kind: 'if',
        condition: { kind: 'read', address: SYSTEM_BITS.firstScan },
        then: inits,
      });
    }
  }

  // --------------------------------------------------------------------------- resolution

  /** Address (or edge temp) a variable reference reads; null after reporting an error. */
  private readOf(v: VarRef): Expr | null {
    const local = this.locals.get(v.name.toUpperCase());
    if (local?.edgeTemp) {
      if (v.member !== 'Q') {
        this.error('ST_UNKNOWN_MEMBER', v.range, { name: v.name, member: v.member ?? '' });
        return null;
      }
      return { kind: 'temp', name: local.edgeTemp, ...this.src(v.range) };
    }
    const base = local?.address ?? this.resolveName(v);
    if (!base) return null;
    if (!v.member) return { kind: 'read', address: base, ...this.src(v.range) };
    const ref = parseAddress(base);
    if (ref?.kind !== 'timer' && ref?.kind !== 'counter') {
      this.error('ST_UNKNOWN_MEMBER', v.range, { name: v.name, member: v.member });
      return null;
    }
    const address = `${base}.${v.member}`;
    if (!parseAddress(address)) {
      this.error('ST_UNKNOWN_MEMBER', v.range, { name: v.name, member: v.member });
      return null;
    }
    return { kind: 'read', address, ...this.src(v.range) };
  }

  /** Tag name or direct address → canonical address. */
  private resolveName(v: VarRef): string | null {
    const res = resolveOperand(v.name, this.tags);
    if (res.ok) {
      const ref = parseAddress(res.address);
      // T0 / C0 written alone mean the instance, i.e. their Q output.
      return ref && (ref.kind === 'timer' || ref.kind === 'counter')
        ? `${ref.kind === 'timer' ? 'T' : 'C'}${ref.index}`
        : res.address;
    }
    this.error('ST_UNKNOWN_NAME', v.range, { name: v.name });
    return null;
  }

  /** Address an assignment writes to. */
  private writeOf(v: VarRef): string | null {
    const local = this.locals.get(v.name.toUpperCase());
    if (local && (local.edgeTemp || !['BOOL', 'INT', 'REAL', 'TIME'].includes(local.decl.type))) {
      this.error('ST_NOT_WRITABLE', v.range, { name: v.name });
      return null;
    }
    if (v.member) {
      this.error('ST_NOT_WRITABLE', v.range, { name: `${v.name}.${v.member}` });
      return null;
    }
    return local?.address ?? this.resolveName(v);
  }

  // --------------------------------------------------------------------------- expressions

  private expr(e: Expression): Expr | null {
    const result = this.exprNode(e);
    if (result && e.probe) result.probe = e.probe;
    return result;
  }

  private exprNode(e: Expression): Expr | null {
    const s = this.src(e.range);
    switch (e.kind) {
      case 'bool':
        return { kind: 'const', value: e.value, ...s };
      case 'number': {
        const lit = parseLiteral(e.text);
        if (!lit) {
          this.error('ST_BAD_LITERAL', e.range, { text: e.text });
          return null;
        }
        return { kind: 'const', value: lit.value, type: lit.type, ...s };
      }
      case 'time': {
        const ms = parseTime(e.text);
        if (ms === null) {
          this.error('ST_BAD_LITERAL', e.range, { text: e.text });
          return null;
        }
        return { kind: 'const', value: ms, type: 'TIME', ...s };
      }
      case 'var':
        return this.readOf(e);
      case 'temp':
        return { kind: 'temp', name: e.name, ...s };
      case 'unary': {
        if (e.op === '-' && e.arg.kind === 'number') {
          const lit = parseLiteral(`-${e.arg.text}`);
          if (lit) return { kind: 'const', value: lit.value, type: lit.type, ...s };
        }
        const arg = this.expr(e.arg);
        if (!arg) return null;
        return e.op === 'NOT'
          ? { kind: 'not', arg, ...s }
          : {
              kind: 'arith',
              op: '-',
              left: { kind: 'const', value: 0, type: 'INT' },
              right: arg,
              ...s,
            };
      }
      case 'binary': {
        if (e.op === '**') {
          this.error('ST_UNSUPPORTED', e.range, { feature: '**' });
          return null;
        }
        const left = this.expr(e.left);
        const right = this.expr(e.right);
        if (!left || !right) return null;
        if (e.op === 'AND' || e.op === 'OR' || e.op === 'XOR') {
          const kind = e.op.toLowerCase() as 'and' | 'or' | 'xor';
          const flat = (x: Expr) => (x.kind === kind && x.source === undefined ? x.args : [x]);
          return { kind, args: [...flat(left), ...flat(right)], ...s };
        }
        if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) {
          return { kind: 'compare', op: e.op as CompareOp, left, right, ...s };
        }
        return { kind: 'arith', op: e.op as ArithOp, left, right, ...s };
      }
      case 'call': {
        const m = /^(?:[A-Z]+_)?TO_(INT|DINT|REAL|LREAL|TIME)$/.exec(e.name);
        if (!m) {
          this.error('ST_UNKNOWN_FUNCTION', e.range, { name: e.name });
          return null;
        }
        if (e.args.length !== 1) {
          this.error('ST_ARGUMENT_COUNT', e.range, { name: e.name, count: 1 });
          return null;
        }
        const arg = this.expr(e.args[0]!);
        if (!arg) return null;
        const to = m[1] === 'REAL' || m[1] === 'LREAL' ? 'REAL' : m[1] === 'TIME' ? 'TIME' : 'INT';
        return { kind: 'convert', to, arg, ...s };
      }
    }
  }

  // ---------------------------------------------------------------------------- statements

  private block(list: Statement[]): Stmt[] {
    return list.flatMap((st) => this.statement(st));
  }

  private statement(st: Statement): Stmt[] {
    switch (st.kind) {
      case 'assign': {
        const target = this.writeOf(st.target);
        const value = this.expr(st.value);
        return target && value ? [{ kind: 'assign', target, value, ...this.src(st.range) }] : [];
      }
      case 'fbcall':
        return this.fbCall(st);
      case 'let': {
        const value = this.expr(st.value);
        return value ? [{ kind: 'let', name: st.name, value, ...this.src(st.range) }] : [];
      }
      case 'if': {
        let elseBody: Stmt[] | undefined = st.else ? this.block(st.else) : undefined;
        for (let k = st.branches.length - 1; k >= 0; k--) {
          const b = st.branches[k]!;
          const condition = this.expr(b.condition);
          const then = this.block(b.body);
          if (!condition) return [];
          const node: Stmt = {
            kind: 'if',
            condition,
            then,
            ...(elseBody ? { else: elseBody } : {}),
            ...this.src(b.condition.range),
          };
          elseBody = [node];
        }
        return elseBody ?? [];
      }
      case 'case': {
        const selector = this.expr(st.selector);
        const name = this.newTemp('case');
        const sel: Expr = { kind: 'temp', name };
        let elseBody: Stmt[] | undefined = st.else ? this.block(st.else) : undefined;
        for (let k = st.branches.length - 1; k >= 0; k--) {
          const b = st.branches[k]!;
          const conditions: Expr[] = [];
          for (const label of b.labels) {
            const from = this.caseLabel(label.from);
            const to = label.to ? this.caseLabel(label.to) : null;
            if (from === null) continue;
            const c = (v: number): Expr => ({ kind: 'const', value: v, type: 'INT' });
            conditions.push(
              to === null
                ? { kind: 'compare', op: '=', left: sel, right: c(from) }
                : {
                    kind: 'and',
                    args: [
                      { kind: 'compare', op: '>=', left: sel, right: c(from) },
                      { kind: 'compare', op: '<=', left: sel, right: c(to) },
                    ],
                  },
            );
          }
          const then = this.block(b.body);
          if (conditions.length === 0) continue;
          elseBody = [
            {
              kind: 'if',
              condition:
                conditions.length === 1 ? conditions[0]! : { kind: 'or', args: conditions },
              then,
              ...(elseBody ? { else: elseBody } : {}),
            },
          ];
        }
        if (!selector) return [];
        return [
          { kind: 'let', name, value: selector, ...this.src(st.selector.range) },
          ...(elseBody ?? []),
        ];
      }
      case 'for': {
        const target = this.writeOf(st.variable);
        const type = target ? parseAddress(target) : null;
        if (target && !(type?.kind === 'word' && type.area !== 'MD')) {
          this.error('ST_FOR_VARIABLE', st.variable.range, { name: st.variable.name });
        }
        let step = 1;
        if (st.by) {
          const lit =
            st.by.kind === 'number'
              ? parseLiteral(st.by.text)
              : st.by.kind === 'unary' && st.by.op === '-' && st.by.arg.kind === 'number'
                ? parseLiteral(`-${st.by.arg.text}`)
                : null;
          if (!lit || lit.type !== 'INT' || lit.value === 0) {
            this.error('ST_FOR_STEP', st.by.range);
          } else {
            step = lit.value;
          }
        }
        const from = this.expr(st.from);
        const to = this.expr(st.to);
        this.loopDepth++;
        const body = this.block(st.body);
        this.loopDepth--;
        if (!target || !from || !to) return [];
        const end = this.newTemp('for_end');
        const v: Expr = { kind: 'read', address: target };
        const s = this.src(st.range);
        return [
          { kind: 'assign', target, value: from, ...s },
          { kind: 'let', name: end, value: to },
          {
            kind: 'while',
            condition: {
              kind: 'compare',
              op: step > 0 ? '<=' : '>=',
              left: v,
              right: { kind: 'temp', name: end },
            },
            body: [
              ...body,
              {
                kind: 'assign',
                target,
                value: {
                  kind: 'arith',
                  op: '+',
                  left: v,
                  right: { kind: 'const', value: step, type: 'INT' },
                },
              },
            ],
            ...s,
          },
        ];
      }
      case 'while': {
        const condition = this.expr(st.condition);
        this.loopDepth++;
        const body = this.block(st.body);
        this.loopDepth--;
        return condition ? [{ kind: 'while', condition, body, ...this.src(st.range) }] : [];
      }
      case 'repeat': {
        // REPEAT body UNTIL c  ≡  first := TRUE; WHILE first OR NOT c DO first := FALSE; body
        const first = this.newTemp('repeat');
        this.loopDepth++;
        const body = this.block(st.body);
        this.loopDepth--;
        const until = this.expr(st.until);
        if (!until) return [];
        return [
          { kind: 'let', name: first, value: { kind: 'const', value: true } },
          {
            kind: 'while',
            condition: {
              kind: 'or',
              args: [
                { kind: 'temp', name: first },
                { kind: 'not', arg: until },
              ],
            },
            body: [{ kind: 'let', name: first, value: { kind: 'const', value: false } }, ...body],
            ...this.src(st.range),
          },
        ];
      }
      case 'exit':
        if (this.loopDepth === 0) {
          this.error('ST_EXIT_OUTSIDE_LOOP', st.range);
          return [];
        }
        return [{ kind: 'exit', ...this.src(st.range) }];
      case 'return':
        this.error('ST_UNSUPPORTED', st.range, { feature: 'RETURN' });
        return [];
    }
  }

  private caseLabel(e: Expression): number | null {
    const text =
      e.kind === 'number'
        ? e.text
        : e.kind === 'unary' && e.op === '-' && e.arg.kind === 'number'
          ? `-${e.arg.text}`
          : null;
    const lit = text === null ? null : parseLiteral(text);
    if (!lit || lit.type !== 'INT') {
      this.error('ST_CASE_LABEL', e.range);
      return null;
    }
    return lit.value;
  }

  private fbCall(st: Extract<Statement, { kind: 'fbcall' }>): Stmt[] {
    const local = this.locals.get(st.name.toUpperCase());
    if (!local) {
      const res = resolveOperand(st.name, this.tags);
      const ref = res.ok ? parseAddress(res.address) : null;
      if (ref?.kind === 'timer' || ref?.kind === 'counter') {
        this.error('ST_UNDECLARED_FB', st.range, {
          name: st.name,
          example: ref.kind === 'timer' ? 'TON' : 'CTU',
        });
      } else {
        this.error('ST_NOT_CALLABLE', st.range, { name: st.name });
      }
      return [];
    }
    const type = local.decl.type;
    const spec = FB_PARAMS[type];
    if (!spec) {
      this.error('ST_NOT_CALLABLE', st.range, { name: st.name });
      return [];
    }

    const values = new Map<string, Expr | null>();
    for (const p of st.params) {
      if (!spec.some(([n]) => n === p.name)) {
        this.error('ST_UNKNOWN_PARAM', p.range, { name: st.name, param: p.name, type });
        continue;
      }
      if (values.has(p.name)) {
        this.error('ST_DUPLICATE_PARAM', p.range, { param: p.name });
        continue;
      }
      values.set(p.name, this.expr(p.value));
    }
    let ok = true;
    for (const [n, required] of spec) {
      if (required && !values.has(n)) {
        this.error('ST_MISSING_PARAM', st.range, { name: st.name, param: n, type });
        ok = false;
      }
    }
    if (!ok || [...values.values()].some((v) => v === null)) return [];
    const get = (n: string) => values.get(n) ?? undefined;
    const s = this.src(st.range);

    if (isEdge(type)) {
      if (local.called) {
        this.error('ST_DUPLICATE_CALL', st.range, { name: st.name });
        return [];
      }
      local.called = true;
      return [
        {
          kind: 'let',
          name: local.edgeTemp!,
          value: {
            kind: 'edge',
            direction: type === 'R_TRIG' ? 'rising' : 'falling',
            arg: get('CLK')!,
            instance: `st:${st.name.toUpperCase()}`,
            ...s,
          },
        },
      ];
    }
    if (isTimer(type)) {
      return [
        {
          kind: 'timer',
          type: type as 'TON' | 'TOF' | 'TP',
          instance: local.address!,
          input: get('IN')!,
          preset: get('PT')!,
          ...s,
        },
      ];
    }
    const up = get('CU');
    const down = get('CD');
    const reset = get('R');
    const load = get('LD');
    return [
      {
        kind: 'counter',
        type: type as 'CTU' | 'CTD' | 'CTUD',
        instance: local.address!,
        ...(up ? { up } : {}),
        ...(down ? { down } : {}),
        ...(reset ? { reset } : {}),
        ...(load ? { load } : {}),
        preset: get('PV')!,
        ...s,
      },
    ];
  }
}

function dedupe(list: StDiagnostic[]): StDiagnostic[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = `${d.code}|${d.range.start.offset}|${d.range.end.offset}|${JSON.stringify(d.params)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
