/**
 * Comparisons, arithmetic and conversions.
 * Values are JS numbers during evaluation; they take their PLC width when stored
 * (INT → Int16Array wraps at ±32768, REAL → Float32Array).
 */
import type { ArithOp, CompareOp } from '@/simulator/ir/types';
import type { DataType } from '../address';

export type Value = boolean | number;
export type ValueFn = () => Value;

export function compareOp(op: CompareOp, left: ValueFn, right: ValueFn): () => boolean {
  switch (op) {
    case '=':
      return () => left() === right();
    case '<>':
      return () => left() !== right();
    case '<':
      return () => (left() as number) < (right() as number);
    case '>':
      return () => (left() as number) > (right() as number);
    case '<=':
      return () => (left() as number) <= (right() as number);
    case '>=':
      return () => (left() as number) >= (right() as number);
  }
}

/** Wraps a number to the signed 16-bit range (INT). */
export const toInt = (v: number): number =>
  ((((Math.trunc(v) + 32768) % 65536) + 65536) % 65536) - 32768;

export function arithOp(op: ArithOp, type: DataType, left: ValueFn, right: ValueFn): () => number {
  const integer = type !== 'REAL';
  const fit = type === 'INT' ? toInt : (v: number) => v;
  switch (op) {
    case '+':
      return () => fit((left() as number) + (right() as number));
    case '-':
      return () => fit((left() as number) - (right() as number));
    case '*':
      return () => fit((left() as number) * (right() as number));
    case '/':
      return () => {
        const d = right() as number;
        if (d === 0) return 0;
        const q = (left() as number) / d;
        return fit(integer ? Math.trunc(q) : q);
      };
    case 'MOD':
      return () => {
        const d = right() as number;
        return d === 0 ? 0 : fit(Math.trunc(left() as number) % Math.trunc(d));
      };
  }
}

export function convertOp(to: Exclude<DataType, 'BOOL'>, arg: ValueFn): () => number {
  if (to === 'REAL') return () => Math.fround(arg() as number);
  if (to === 'INT') return () => toInt(arg() as number);
  return () => Math.trunc(arg() as number);
}
