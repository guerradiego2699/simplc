/**
 * Ladder instruction catalog: one entry per instruction, describing where it goes (logic side
 * or output/coil side), its family (for drawing) and its operands. The compiler, the properties
 * panel and the palette all read from here.
 *
 * Every element has a main `operand` plus optional `params` (extra operands by key).
 */

export type OperandKind =
  /** A bit to read (I, Q, M, S, T0, C0…). */
  | 'bit'
  /** A bit to write (Q, M). */
  | 'bitTarget'
  /** A number: literal (5, 1.5, T#2s) or word/member address (MW0, IW0, T0.ET, C0.CV). */
  | 'number'
  /** A word to write (MW, MD, QW). */
  | 'numberTarget'
  /** A duration: TIME literal (T#5s) or a word holding milliseconds. */
  | 'time'
  /** A timer instance: T0…T31. */
  | 'timer'
  /** A counter instance: C0…C31. */
  | 'counter';

export interface ParamSpec {
  key: string;
  kind: OperandKind;
  optional?: boolean;
}

export type Family = 'contact' | 'compare' | 'timer' | 'counter' | 'coil' | 'box';

export interface InstructionSpec {
  side: 'logic' | 'output';
  family: Family;
  /** Text drawn inside boxes / compare contacts. */
  symbol: string;
  main: ParamSpec;
  params: ParamSpec[];
  /** Default extra operands for a new element. */
  defaults?: Record<string, string>;
}

const contact = (symbol: string): InstructionSpec => ({
  side: 'logic',
  family: 'contact',
  symbol,
  main: { key: 'operand', kind: 'bit' },
  params: [],
});
const compare = (symbol: string): InstructionSpec => ({
  side: 'logic',
  family: 'compare',
  symbol,
  main: { key: 'operand', kind: 'number' },
  params: [{ key: 'in2', kind: 'number' }],
});
const timer = (symbol: string): InstructionSpec => ({
  side: 'logic',
  family: 'timer',
  symbol,
  main: { key: 'operand', kind: 'timer' },
  params: [{ key: 'pt', kind: 'time' }],
  defaults: { pt: 'T#5s' },
});
const coilSpec = (symbol: string): InstructionSpec => ({
  side: 'output',
  family: 'coil',
  symbol,
  main: { key: 'operand', kind: 'bitTarget' },
  params: [],
});
const math = (symbol: string): InstructionSpec => ({
  side: 'output',
  family: 'box',
  symbol,
  main: { key: 'operand', kind: 'numberTarget' },
  params: [
    { key: 'in1', kind: 'number' },
    { key: 'in2', kind: 'number' },
  ],
});

export const CATALOG = {
  // Logic side
  NO: contact(''),
  NC: contact('/'),
  P: contact('P'),
  N: contact('N'),
  EQ: compare('=='),
  NE: compare('<>'),
  LT: compare('<'),
  GT: compare('>'),
  LE: compare('<='),
  GE: compare('>='),
  TON: timer('TON'),
  TOF: timer('TOF'),
  TP: timer('TP'),
  CTU: {
    side: 'logic',
    family: 'counter',
    symbol: 'CTU',
    main: { key: 'operand', kind: 'counter' },
    params: [
      { key: 'pv', kind: 'number' },
      { key: 'r', kind: 'bit', optional: true },
    ],
    defaults: { pv: '10' },
  },
  CTD: {
    side: 'logic',
    family: 'counter',
    symbol: 'CTD',
    main: { key: 'operand', kind: 'counter' },
    params: [
      { key: 'pv', kind: 'number' },
      { key: 'ld', kind: 'bit', optional: true },
    ],
    defaults: { pv: '10' },
  },
  CTUD: {
    side: 'logic',
    family: 'counter',
    symbol: 'CTUD',
    main: { key: 'operand', kind: 'counter' },
    params: [
      { key: 'pv', kind: 'number' },
      { key: 'cd', kind: 'bit' },
      { key: 'r', kind: 'bit', optional: true },
      { key: 'ld', kind: 'bit', optional: true },
    ],
    defaults: { pv: '10' },
  },
  // Output side
  coil: coilSpec(''),
  negated: coilSpec('/'),
  set: coilSpec('S'),
  reset: coilSpec('R'),
  MOVE: {
    side: 'output',
    family: 'box',
    symbol: 'MOVE',
    main: { key: 'operand', kind: 'numberTarget' },
    params: [{ key: 'in', kind: 'number' }],
  },
  ADD: math('ADD'),
  SUB: math('SUB'),
  MUL: math('MUL'),
  DIV: math('DIV'),
  SCALE: {
    side: 'output',
    family: 'box',
    symbol: 'SCALE',
    main: { key: 'operand', kind: 'numberTarget' },
    params: [
      { key: 'in', kind: 'number' },
      { key: 'inMin', kind: 'number' },
      { key: 'inMax', kind: 'number' },
      { key: 'outMin', kind: 'number' },
      { key: 'outMax', kind: 'number' },
    ],
    defaults: { inMin: '0', inMax: '27648', outMin: '0', outMax: '100' },
  },
} as const satisfies Record<string, InstructionSpec>;

export type InstructionType = keyof typeof CATALOG;

export const LOGIC_TYPES = [
  'NO',
  'NC',
  'P',
  'N',
  'EQ',
  'NE',
  'LT',
  'GT',
  'LE',
  'GE',
  'TON',
  'TOF',
  'TP',
  'CTU',
  'CTD',
  'CTUD',
] as const;
export const OUTPUT_TYPES = [
  'coil',
  'negated',
  'set',
  'reset',
  'MOVE',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
  'SCALE',
] as const;
export type LogicType = (typeof LOGIC_TYPES)[number];
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const spec = (type: InstructionType): InstructionSpec => CATALOG[type];

/** Types an element can be switched to in the properties panel (same family). */
export function siblingTypes(type: InstructionType): InstructionType[] {
  const family = spec(type).family;
  return (Object.keys(CATALOG) as InstructionType[]).filter((t) => spec(t).family === family);
}
