import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, Memory } from '../memory';

const ref = (area: 'I' | 'Q' | 'M' | 'S', byte: number, bit: number) => ({ area, byte, bit });

describe('Memory', () => {
  it('has 16 inputs, 16 outputs and 256 markers by default', () => {
    const m = new Memory();
    expect(m.bits.I.length).toBe(16);
    expect(m.bits.Q.length).toBe(16);
    expect(m.bits.M.length).toBe(256);
    expect(m.physicalInputs.length).toBe(16);
    expect(m.physicalOutputs.length).toBe(16);
  });

  it('knows which addresses exist', () => {
    const m = new Memory();
    expect(m.contains(ref('I', 1, 7))).toBe(true);
    expect(m.contains(ref('I', 2, 0))).toBe(false);
    expect(m.contains(ref('M', 31, 7))).toBe(true);
    expect(m.contains(ref('M', 32, 0))).toBe(false);
  });

  it('reads and writes bits independently', () => {
    const m = new Memory();
    m.set(ref('M', 0, 1), true);
    expect(m.get(ref('M', 0, 1))).toBe(true);
    expect(m.get(ref('M', 0, 0))).toBe(false);
    expect(m.get(ref('Q', 0, 1))).toBe(false);
    m.set(ref('M', 0, 1), false);
    expect(m.get(ref('M', 0, 1))).toBe(false);
  });

  it('warm restart keeps retentive markers and clears the rest', () => {
    const m = new Memory({ ...DEFAULT_LAYOUT, retentiveMarkerBytes: 1 });
    m.set(ref('M', 0, 3), true); // retentive
    m.set(ref('M', 1, 0), true); // not retentive
    m.set(ref('Q', 0, 0), true);
    m.physicalOutputs[0] = 1;
    m.edges.set('e1', true);

    m.restart(false);
    expect(m.get(ref('M', 0, 3))).toBe(true);
    expect(m.get(ref('M', 1, 0))).toBe(false);
    expect(m.get(ref('Q', 0, 0))).toBe(false);
    expect(m.physicalOutputs[0]).toBe(0);
    expect(m.edges.size).toBe(0);
  });

  it('cold restart clears retentive markers too', () => {
    const m = new Memory({ ...DEFAULT_LAYOUT, retentiveMarkerBytes: 1 });
    m.set(ref('M', 0, 3), true);
    m.restart(true);
    expect(m.get(ref('M', 0, 3))).toBe(false);
  });

  it('rejects more retentive bytes than marker bytes', () => {
    expect(() => new Memory({ ...DEFAULT_LAYOUT, retentiveMarkerBytes: 99 })).toThrow(RangeError);
  });
});
