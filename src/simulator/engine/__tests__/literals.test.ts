import { describe, expect, it } from 'vitest';
import { formatAddress, normalizeAddress, parseAddress, typeOfAddress } from '../address';
import { formatTime, formatTimeLiteral, parseLiteral, parseTime } from '../literals';

describe('addresses (words, timers, counters)', () => {
  it.each([
    ['MW3', { kind: 'word', area: 'MW', index: 3 }],
    ['%MD0', { kind: 'word', area: 'MD', index: 0 }],
    ['iw1', { kind: 'word', area: 'IW', index: 1 }],
    ['T0', { kind: 'timer', index: 0, member: 'Q' }],
    ['t2.et', { kind: 'timer', index: 2, member: 'ET' }],
    ['C5.CV', { kind: 'counter', index: 5, member: 'CV' }],
    ['I0.3', { kind: 'bit', area: 'I', byte: 0, bit: 3 }],
  ])('parses %s', (text, expected) => {
    expect(parseAddress(text)).toEqual(expected);
  });

  it.each(['MW', 'T0.XX', 'C1.ET', 'MX0', 'D0', 'TON'])('rejects %s', (text) => {
    expect(parseAddress(text)).toBeNull();
  });

  it('normalizes and types addresses', () => {
    expect(normalizeAddress('%mw7')).toBe('MW7');
    expect(normalizeAddress('t1.q')).toBe('T1');
    expect(formatAddress({ kind: 'counter', index: 2, member: 'QD' })).toBe('C2.QD');
    expect(typeOfAddress(parseAddress('MD0')!)).toBe('REAL');
    expect(typeOfAddress(parseAddress('T0.ET')!)).toBe('TIME');
    expect(typeOfAddress(parseAddress('C0.CV')!)).toBe('INT');
    expect(typeOfAddress(parseAddress('C0')!)).toBe('BOOL');
  });
});

describe('literals', () => {
  it.each([
    ['T#5s', 5000],
    ['T#250ms', 250],
    ['T#1m30s', 90_000],
    ['TIME#2h', 7_200_000],
    ['t#1.5s', 1500],
    ['T#1d2h', 93_600_000],
    ['T#-2s', -2000],
    ['T#1_000ms', 1000],
  ])('parses TIME %s', (text, ms) => {
    expect(parseTime(text)).toBe(ms);
  });

  it.each(['T#', 'T#5', 'T#5x', 'T#s5', '5s', 'T#1s 2ms'])('rejects TIME %j', (text) => {
    expect(parseTime(text)).toBeNull();
  });

  it('parses INT, REAL and based numbers', () => {
    expect(parseLiteral('42')).toEqual({ type: 'INT', value: 42 });
    expect(parseLiteral('-7')).toEqual({ type: 'INT', value: -7 });
    expect(parseLiteral('16#FF')).toEqual({ type: 'INT', value: 255 });
    expect(parseLiteral('2#1010')).toEqual({ type: 'INT', value: 10 });
    expect(parseLiteral('1.5')).toEqual({ type: 'REAL', value: 1.5 });
    expect(parseLiteral('1e3')).toEqual({ type: 'REAL', value: 1000 });
    expect(parseLiteral('T#3s')).toEqual({ type: 'TIME', value: 3000 });
    expect(parseLiteral('MW0')).toBeNull();
    expect(parseLiteral('')).toBeNull();
  });

  it('formats times for people and as IEC literals', () => {
    expect(formatTime(250)).toBe('250 ms');
    expect(formatTime(1500, 'es-CL')).toBe('1,5 s');
    expect(formatTime(90_000)).toBe('1 min 30 s');
    expect(formatTimeLiteral(90_500)).toBe('T#1m30s500ms');
    expect(formatTimeLiteral(0)).toBe('T#0ms');
  });
});
