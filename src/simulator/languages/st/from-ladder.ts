/**
 * Ladder → Structured Text conversion (spec 6.4: "LD → ST").
 *
 * The output behaves exactly like the Ladder program: it mirrors the evaluation order of
 * languages/ladder/compile.ts (edges and timer/counter calls in element order, then the coils of
 * the rung). Tag names are used whenever an address has one. Visible comments come from
 * `texts`, so the generated program follows the UI language.
 */
import { parseLiteral } from '@/simulator/engine';
import { spec } from '@/simulator/languages/ladder/catalog';
import type { Coil, Contact, LadderProgram, Series } from '@/simulator/languages/ladder/model';
import { isValidTagName, resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';

export interface LadderToStTexts {
  /** First comment line, e.g. "Motor start — converted from Ladder". */
  header: string;
  /** Rung heading in comments; `{n}` is the rung number. */
  rung: string;
  /** Identifier prefix for rung results that feed several outputs (e.g. RUNG → RUNG_3). */
  rungVariable: string;
}

/** Operator precedence used to add only the parentheses that are needed. */
const PREC = { or: 1, xor: 2, and: 3, compare: 4, sum: 5, product: 6, unary: 7, atom: 8 } as const;
interface Code {
  text: string;
  prec: number;
}
const atom = (text: string): Code => ({ text, prec: PREC.atom });
const wrap = (c: Code, min: number) => (c.prec < min ? `(${c.text})` : c.text);

const and = (a: Code | null, b: Code): Code =>
  a === null ? b : { text: `${wrap(a, PREC.and)} AND ${wrap(b, PREC.and)}`, prec: PREC.and };
const or = (parts: Code[]): Code =>
  parts.length === 1
    ? parts[0]!
    : { text: parts.map((p) => wrap(p, PREC.or)).join(' OR '), prec: PREC.or };
const not = (c: Code): Code => ({ text: `NOT ${wrap(c, PREC.unary)}`, prec: PREC.unary });

const COMPARE: Record<string, string> = { EQ: '=', NE: '<>', LT: '<', GT: '>', LE: '<=', GE: '>=' };
const MATH: Record<string, string> = { ADD: '+', SUB: '-', MUL: '*', DIV: '/' };

/** Comment text that cannot close the comment early. */
const comment = (text: string) => `(* ${text.replace(/\*\)/g, '* )').replace(/\n/g, ' ')} *)`;

export function ladderToSt(
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

  /** How an operand is written in ST: literal as typed, tag name, or canonical address. */
  const name = (text: string): string => {
    const t = text.trim();
    const res = resolveOperand(t, tags);
    if (!res.ok) return t === '' ? '???' : t;
    return res.tag && isValidTagName(res.tag.name) ? res.tag.name : res.address;
  };
  const value = (text: string): Code =>
    parseLiteral(text.trim()) ? atom(text.trim()) : atom(name(text));
  const param = (el: Contact | Coil, key: string) => el.params?.[key] ?? '';

  /** VAR declaration for a timer/counter instance (once per instance). */
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
    const calls: string[] = [];

    const element = (c: Contact, power: Code | null): Code | null => {
      const info = spec(c.type);
      switch (info.family) {
        case 'contact': {
          const bit = atom(name(c.operand));
          if (c.type === 'NO') return and(power, bit);
          if (c.type === 'NC') return and(power, not(bit));
          const edge = unique(c.type === 'P' ? 'R_TRIG' : 'F_TRIG');
          decls.push(`  ${edge} : ${c.type === 'P' ? 'R_TRIG' : 'F_TRIG'};`);
          calls.push(`${edge}(CLK := ${bit.text});`);
          return and(power, atom(`${edge}.Q`));
        }
        case 'compare': {
          const cmp: Code = {
            text: `${wrap(value(c.operand), PREC.sum)} ${COMPARE[c.type]} ${wrap(value(param(c, 'in2')), PREC.sum)}`,
            prec: PREC.compare,
          };
          return and(power, cmp);
        }
        case 'timer': {
          const instance = name(c.operand);
          declareInstance(instance, c.type);
          calls.push(
            `${instance}(IN := ${(power ?? atom('TRUE')).text}, PT := ${value(param(c, 'pt')).text});`,
          );
          return atom(`${instance}.Q`);
        }
        case 'counter': {
          const instance = name(c.operand);
          declareInstance(instance, c.type);
          const p = (power ?? atom('TRUE')).text;
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
          calls.push(
            `${instance}(${[...pins, `PV := ${value(param(c, 'pv')).text}`].join(', ')});`,
          );
          return atom(`${instance}.Q`);
        }
        default:
          return power;
      }
    };

    const series = (s: Series, input: Code | null): Code | null => {
      let power = input;
      for (const item of s.items) {
        if (item.kind === 'contact') {
          power = element(item, power);
        } else {
          const outs = item.branches.map((b) => series(b, power) ?? atom('TRUE'));
          power = or(outs);
        }
      }
      return power;
    };

    let power = series(rung.logic, null) ?? atom('TRUE');
    body.push(...calls);

    // A rung result used by several outputs is stored once, like the Ladder compiler does.
    if (rung.coils.length > 1 && power.prec !== PREC.atom) {
      const v = unique(texts.rungVariable);
      decls.push(`  ${v} : BOOL;`);
      body.push(`${v} := ${power.text};`);
      power = atom(v);
    }

    for (const c of rung.coils) {
      const target = name(c.operand);
      const always = power.text === 'TRUE';
      const guarded = (statement: string) =>
        always ? statement : `IF ${power.text} THEN ${statement} END_IF;`;
      switch (c.type) {
        case 'coil':
          body.push(`${target} := ${power.text};`);
          break;
        case 'negated':
          body.push(`${target} := ${not(power).text};`);
          break;
        case 'set':
          body.push(guarded(`${target} := TRUE;`));
          break;
        case 'reset':
          body.push(guarded(`${target} := FALSE;`));
          break;
        case 'MOVE':
          body.push(guarded(`${target} := ${value(param(c, 'in')).text};`));
          break;
        case 'SCALE': {
          const r = (k: string) => `TO_REAL(${value(param(c, k)).text})`;
          body.push(
            guarded(
              `${target} := (${r('in')} - ${r('inMin')}) * (${r('outMax')} - ${r('outMin')}) / (${r('inMax')} - ${r('inMin')}) + ${r('outMin')};`,
            ),
          );
          break;
        }
        default: {
          const op = MATH[c.type];
          if (op) {
            const a = value(param(c, 'in1'));
            const b = value(param(c, 'in2'));
            body.push(guarded(`${target} := ${wrap(a, PREC.sum)} ${op} ${wrap(b, PREC.product)};`));
          }
        }
      }
    }
    body.push('');
  });

  const out = [comment(texts.header), ''];
  if (decls.length) out.push('VAR', ...decls, 'END_VAR', '');
  out.push(...body);
  return `${out.join('\n').trimEnd()}\n`;
}
