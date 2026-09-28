import { describe, expect, it } from 'vitest';
import { isValidTagName, resolveOperand, tag, tagForAddress, validateTags } from './tags';

describe('tags', () => {
  it('validates names: identifiers that do not look like addresses', () => {
    expect(isValidTagName('START')).toBe(true);
    expect(isValidTagName('Motor_1')).toBe(true);
    expect(isValidTagName('_x')).toBe(true);
    expect(isValidTagName('1abc')).toBe(false);
    expect(isValidTagName('my tag')).toBe(false);
    expect(isValidTagName('')).toBe(false);
    expect(isValidTagName('M0')).toBe(true); // not an address
    expect(isValidTagName('T0')).toBe(false); // timer address
    expect(isValidTagName('MW1')).toBe(false);
    expect(isValidTagName('I0.0')).toBe(false);
  });

  it('reports invalid names, duplicates (case-insensitive) and bad addresses', () => {
    const a = tag('Start', 'I0.0');
    const b = tag('START', 'I0.1');
    const c = tag('bad name', 'X9');
    const problems = validateTags([a, b, c]);
    expect(problems.get(a.id)).toEqual(['DUPLICATE_TAG']);
    expect(problems.get(b.id)).toEqual(['DUPLICATE_TAG']);
    expect(problems.get(c.id)).toEqual(['INVALID_TAG_NAME', 'INVALID_TAG_ADDRESS']);
  });

  it('resolves operands: addresses, tag names, missing and unknown', () => {
    const tags = [tag('Motor', 'q0.0')];
    expect(resolveOperand('I0.1', tags)).toEqual({ ok: true, address: 'I0.1' });
    expect(resolveOperand('%QX0.0', tags)).toMatchObject({
      ok: true,
      address: 'Q0.0',
      tag: tags[0],
    });
    expect(resolveOperand(' motor ', tags)).toMatchObject({ ok: true, address: 'Q0.0' });
    expect(resolveOperand('', tags)).toEqual({ ok: false, problem: 'MISSING_OPERAND' });
    expect(resolveOperand('Pump', tags)).toEqual({ ok: false, problem: 'UNKNOWN_SYMBOL' });
  });

  it('finds the tag of an address', () => {
    const tags = [tag('Motor', 'Q0.0')];
    expect(tagForAddress('%QX0.0', tags)?.name).toBe('Motor');
    expect(tagForAddress('Q0.1', tags)).toBeUndefined();
  });
});
