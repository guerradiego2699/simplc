/**
 * Ladder → Instruction List conversion (spec 6.4: "LD → IL").
 *
 * Same evaluation order as languages/ladder/compile.ts (and as the LD → ST converter): edge
 * detectors and timer/counter calls in element order, then the coils of the rung. IL has no
 * expressions inside CAL, so a rung result that feeds a timer/counter input is first stored in a
 * BOOL helper variable. MOVE / math / SCALE boxes run only when the rung is powered, using a
 * forward conditional jump (JMPCN) around them.
 */
import { parseLiteral } from '@/simulator/engine';
import { spec } from '@/simulator/languages/ladder/catalog';
import type { Coil, Contact, LadderProgram, Series } from '@/simulator/languages/ladder/model';
import { isValidTagName, resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import type { LadderToStTexts } from '../st/from-ladder';

/** Logic of a rung as a tree of operands. */
type Node =
  | { kind: 'atom'; text: string }
  | { kind: 'not'; arg: Node }
  | { kind: 'and' | 'or'; args: Node[] }
  | { kind: 'compare'; op: string; left: string; right: string };

const COMPARE: Record<string, string> = {
  EQ: 'EQ',
  NE: 'NE',
  LT: 'LT',
  GT: 'GT',
  LE: 'LE',
  GE: 'GE',
};
const MATH: Record<string, string> = { ADD: 'ADD', SUB: 'SUB', MUL: 'MUL', DIV: 'DIV' };
const TRUE: Node = { kind: 'atom', text: 'TRUE' };

const comment = (text: string) => `(* ${text.replace(/\*\)/g, '* )').replace(/\n/g, ' ')} *)`;
const pad = (op: string) => op.padEnd(6);
const line = (op: string, operand = '') => `  ${pad(op)}${operand}`.trimEnd();

const and = (a: Node | null, b: Node): Node =>
  a === null
    ? b
    : a.kind === 'and'
      ? { kind: 'and', args: [...a.args, b] }
      : { kind: 'and', args: [a, b] };

/** IL lines that leave the value of `node` in the accumulator (the first line is a load). */
function load(node: Node): string[] {
  switch (node.kind) {
    case 'atom':
      return [line('LD', node.text)];
    case 'not':
      return node.arg.kind === 'atom'
        ? [line('LDN', node.arg.text)]
        : [...load(node.arg), line('NOT')];
    case 'compare':
      return [line('LD', node.left), line(node.op, node.right)];
    case 'and':
    case 'or': {
      const op = node.kind.toUpperCase();
      const [first, ...rest] = node.args;
      const out = load(first!);
      for (const arg of rest) {
        if (arg.kind === 'atom') out.push(line(op, arg.text));
        else if (arg.kind === 'not' && arg.arg.kind === 'atom')
          out.push(line(`${op}N`, arg.arg.text));
        else {
          // Deferred operation: OP( operand … )
          const inner = load(arg);
          const head = /^\s*LD\s+(.*)$/.exec(inner[0]!);
          if (head) out.push(line(`${op}(`, head[1]), ...inner.slice(1).map((l) => `  ${l}`));
          else out.push(line(`${op}(`), ...inner.map((l) => `  ${l}`));
          out.push(line(')'));
        }
      }
      return out;
    }
  }
}

export function ladderToIl(
  program: LadderProgram,
  tags: readonly Tag[],
  texts: LadderToStTexts,
): string {
  const decls: string[] = [];
  const declared = new Set<string>();
  const taken = new Set(tags.map((t) => t.name.toUpperCase()));
  const unique = (base: string) => {
    let n = 1;
    while (taken.has(`${base}_${n}`.toUpperCase())) n++;
    const name = `${base}_${n}`;
    taken.add(name.toUpperCase());
    return name;
  };
  let labels = 0;

  const name = (text: string): string => {
    const t = text.trim();
    const res = resolveOperand(t, tags);
    if (!res.ok) return t === '' ? '???' : t;
    return res.tag && isValidTagName(res.tag.name) ? res.tag.name : res.address;
  };
  const value = (text: string) => (parseLiteral(text.trim()) ? text.trim() : name(text));
  const param = (el: Contact | Coil, key: string) => el.params?.[key] ?? '';
  const declareInstance = (instance: string, type: string) => {
    const key = instance.toUpperCase();
    if (declared.has(key)) return;
    declared.add(key);
    decls.push(`  ${instance} : ${type};`);
  };

  const body: string[] = [];

  program.rungs.forEach((rung, index) => {
    const n = index + 1;
    const heading = texts.rung.replace('{n}', String(n));
    body.push(comment(rung.comment ? `${heading}: ${rung.comment}` : heading));

    /** An operand for a CAL parameter: the node itself if simple, else a helper variable. */
    const operandOf = (node: Node | null): string => {
      if (node === null) return 'TRUE';
      if (node.kind === 'atom') return node.text;
      const helper = unique(texts.rungVariable);
      decls.push(`  ${helper} : BOOL;`);
      body.push(...load(node), line('ST', helper));
      return helper;
    };

    const element = (c: Contact, power: Node | null): Node | null => {
      const info = spec(c.type);
      switch (info.family) {
        case 'contact': {
          const bit: Node = { kind: 'atom', text: name(c.operand) };
          if (c.type === 'NO') return and(power, bit);
          if (c.type === 'NC') return and(power, { kind: 'not', arg: bit });
          const type = c.type === 'P' ? 'R_TRIG' : 'F_TRIG';
          const edge = unique(type);
          decls.push(`  ${edge} : ${type};`);
          body.push(line('CAL', `${edge}(CLK := ${name(c.operand)})`));
          return and(power, { kind: 'atom', text: `${edge}.Q` });
        }
        case 'compare':
          return and(power, {
            kind: 'compare',
            op: COMPARE[c.type]!,
            left: value(c.operand),
            right: value(param(c, 'in2')),
          });
        case 'timer': {
          const instance = name(c.operand);
          declareInstance(instance, c.type);
          const input = operandOf(power);
          body.push(line('CAL', `${instance}(IN := ${input}, PT := ${value(param(c, 'pt'))})`));
          return { kind: 'atom', text: `${instance}.Q` };
        }
        case 'counter': {
          const instance = name(c.operand);
          declareInstance(instance, c.type);
          const p = operandOf(power);
          const opt = (key: string, pin: string) =>
            param(c, key).trim() ? [`${pin} := ${name(param(c, key))}`] : [];
          const pins =
            c.type === 'CTU'
              ? [`CU := ${p}`, ...opt('r', 'R')]
              : c.type === 'CTD'
                ? [`CD := ${p}`, ...opt('ld', 'LD')]
                : [
                    `CU := ${p}`,
                    `CD := ${name(param(c, 'cd'))}`,
                    ...opt('r', 'R'),
                    ...opt('ld', 'LD'),
                  ];
          body.push(
            line('CAL', `${instance}(${[...pins, `PV := ${value(param(c, 'pv'))}`].join(', ')})`),
          );
          return { kind: 'atom', text: `${instance}.Q` };
        }
        default:
          return power;
      }
    };

    const series = (s: Series, input: Node | null): Node | null => {
      let power = input;
      for (const item of s.items) {
        if (item.kind === 'contact') {
          power = element(item, power);
        } else {
          const outs = item.branches.map((b) => series(b, power) ?? TRUE);
          power = outs.length === 1 ? outs[0]! : { kind: 'or', args: outs };
        }
      }
      return power;
    };

    let power = series(rung.logic, null) ?? TRUE;
    const isBox = (c: Coil) => spec(c.type).family === 'box';
    // After a box (its skip label) the accumulator is unknown: keep the rung result in a helper.
    if (rung.coils.some(isBox) && rung.coils.length > 1 && power.kind !== 'atom') {
      const helper = unique(texts.rungVariable);
      decls.push(`  ${helper} : BOOL;`);
      body.push(...load(power), line('ST', helper));
      power = { kind: 'atom', text: helper };
    }

    let loaded = false;
    for (const c of rung.coils) {
      const target = name(c.operand);
      if (!isBox(c)) {
        if (!loaded) body.push(...load(power));
        loaded = true;
        const op =
          c.type === 'coil' ? 'ST' : c.type === 'negated' ? 'STN' : c.type === 'set' ? 'S' : 'R';
        body.push(line(op, target));
        continue;
      }
      const always = power.kind === 'atom' && power.text === 'TRUE';
      const skip = `SKIP_${++labels}`;
      if (!always) {
        if (!loaded) body.push(...load(power));
        body.push(line('JMPCN', skip));
      }
      if (c.type === 'MOVE') {
        body.push(line('LD', value(param(c, 'in'))), line('ST', target));
      } else if (c.type === 'SCALE') {
        const v = (k: string) => value(param(c, k));
        body.push(
          line('LD', v('in')),
          line('TO_REAL'),
          line('SUB(', v('inMin')),
          `  ${line('TO_REAL')}`,
          line(')'),
          line('MUL(', v('outMax')),
          `  ${line('TO_REAL')}`,
          `  ${line('SUB(', v('outMin'))}`,
          `    ${line('TO_REAL')}`,
          `  ${line(')')}`,
          line(')'),
          line('DIV(', v('inMax')),
          `  ${line('TO_REAL')}`,
          `  ${line('SUB(', v('inMin'))}`,
          `    ${line('TO_REAL')}`,
          `  ${line(')')}`,
          line(')'),
          line('ADD(', v('outMin')),
          `  ${line('TO_REAL')}`,
          line(')'),
          line('ST', target),
        );
      } else {
        body.push(
          line('LD', value(param(c, 'in1'))),
          line(MATH[c.type]!, value(param(c, 'in2'))),
          line('ST', target),
        );
      }
      if (!always) body.push(`${skip}:`);
      loaded = false;
    }
    body.push('');
  });

  const out = [comment(texts.header), ''];
  if (decls.length) out.push('VAR', ...decls, 'END_VAR', '');
  out.push(...body);
  return `${out.join('\n').trimEnd()}\n`;
}
