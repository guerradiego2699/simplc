/**
 * Numeric literals as users type them in operands:
 *   INT   123, -5, 16#FF, 2#1010
 *   REAL  1.5, -0.25, 1e3
 *   TIME  T#5s, T#1m30s, T#250ms, TIME#2h, T#1.5s (IEC 61131-3), value in milliseconds
 */
import type { DataType } from './address';

export interface Literal {
  type: Exclude<DataType, 'BOOL'>;
  value: number;
}

const TIME_UNITS: Record<string, number> = {
  D: 86_400_000,
  H: 3_600_000,
  M: 60_000,
  S: 1000,
  MS: 1,
};
const TIME_PART = /(\d+(?:\.\d+)?)(MS|D|H|M|S)/g;

export function parseTime(text: string): number | null {
  const t = text.trim().toUpperCase().replace(/_/g, '');
  const m = /^(?:T|TIME)#(-?)(.+)$/.exec(t);
  if (!m) return null;
  const [, sign, body = ''] = m;
  let total = 0;
  let consumed = 0;
  for (const part of body.matchAll(TIME_PART)) {
    if (part.index !== consumed) return null;
    total += Number(part[1]) * (TIME_UNITS[part[2] ?? ''] ?? 0);
    consumed += part[0].length;
  }
  if (consumed !== body.length || consumed === 0) return null;
  return Math.round(sign === '-' ? -total : total);
}

export function parseLiteral(text: string): Literal | null {
  const t = text.trim().replace(/_/g, '');
  if (t === '') return null;
  const time = parseTime(t);
  if (time !== null) return { type: 'TIME', value: time };
  const based = /^(2|8|16)#([0-9A-F]+)$/i.exec(t);
  if (based) {
    const value = parseInt(based[2] ?? '', Number(based[1]));
    return Number.isNaN(value) ? null : { type: 'INT', value };
  }
  if (/^[+-]?\d+$/.test(t)) return { type: 'INT', value: Number(t) };
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?$/i.test(t)) return { type: 'REAL', value: Number(t) };
  return null;
}

/** Human-friendly time: 1500 → "1,5 s" / "1.5 s" (locale decides the decimal separator). */
export function formatTime(ms: number, locale = 'en-US'): string {
  const abs = Math.abs(ms);
  if (abs < 1000) return `${ms} ms`;
  if (abs < 60_000) {
    return `${(ms / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} s`;
  }
  const min = Math.trunc(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

/** IEC TIME literal: 90500 → "T#1m30s500ms". */
export function formatTimeLiteral(ms: number): string {
  if (ms === 0) return 'T#0ms';
  let rest = Math.abs(ms);
  const parts: string[] = [];
  for (const [unit, size] of [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
  ] as const) {
    const n = Math.floor(rest / size);
    if (n) parts.push(`${n}${unit}`);
    rest -= n * size;
  }
  if (rest) parts.push(`${rest}ms`);
  return `T#${ms < 0 ? '-' : ''}${parts.join('')}`;
}
