import { describe, expect, it } from 'vitest';
import { bitIndex, formatBitAddress, normalizeBitAddress, parseBitAddress } from '../address';

describe('parseBitAddress', () => {
  it.each([
    ['I0.0', { area: 'I', byte: 0, bit: 0 }],
    ['Q1.7', { area: 'Q', byte: 1, bit: 7 }],
    ['M10.3', { area: 'M', byte: 10, bit: 3 }],
    ['S0.1', { area: 'S', byte: 0, bit: 1 }],
  ])('parses %s', (text, expected) => {
    expect(parseBitAddress(text)).toEqual(expected);
  });

  it.each(['%IX0.0', '%I0.0', 'ix0.0', ' i0.0 ', '%qx0.0'])(
    'accepts IEC direct representation and loose spelling: %s',
    (text) => {
      expect(parseBitAddress(text)).not.toBeNull();
    },
  );

  it.each(['', 'I0', 'I0.8', 'I-1.0', 'X0.0', 'I0.0.0', 'IW0', 'I.0', 'I12345.0', 'Q0,0'])(
    'rejects %j',
    (text) => {
      expect(parseBitAddress(text)).toBeNull();
    },
  );
});

describe('formatting', () => {
  it('formats and normalizes to canonical form', () => {
    expect(formatBitAddress({ area: 'M', byte: 2, bit: 5 })).toBe('M2.5');
    expect(normalizeBitAddress('%ix1.2')).toBe('I1.2');
    expect(normalizeBitAddress('nope')).toBeNull();
  });

  it('computes linear bit indexes', () => {
    expect(bitIndex({ area: 'I', byte: 0, bit: 0 })).toBe(0);
    expect(bitIndex({ area: 'I', byte: 0, bit: 7 })).toBe(7);
    expect(bitIndex({ area: 'I', byte: 1, bit: 0 })).toBe(8);
    expect(bitIndex({ area: 'Q', byte: 3, bit: 2 })).toBe(26);
  });
});
