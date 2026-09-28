import { describe, expect, it } from 'vitest';
import { formatAddressStyled as f } from './styles';

describe('address styles', () => {
  it('generic returns the canonical form', () => {
    expect(f('%ix1.2', 'generic')).toBe('I1.2');
    expect(f('t0.q', 'generic')).toBe('T0');
  });

  it('Siemens (S7-1200)', () => {
    expect(f('I1.7', 'siemens')).toBe('I1.7');
    expect(f('MW0', 'siemens')).toBe('MW100');
    expect(f('MW3', 'siemens')).toBe('MW106');
    expect(f('MD1', 'siemens')).toBe('MD304');
    expect(f('IW0', 'siemens')).toBe('IW64');
    expect(f('IW1', 'siemens')).toBe('IW66');
    expect(f('S0.1', 'siemens')).toBe('FirstScan');
    expect(f('S0.2', 'siemens')).toBe('Clock_1Hz');
  });

  it('Allen-Bradley (SLC 500)', () => {
    expect(f('I0.0', 'ab')).toBe('I:0/0');
    expect(f('I1.7', 'ab')).toBe('I:0/15');
    expect(f('Q1.0', 'ab')).toBe('O:0/8');
    expect(f('M2.1', 'ab')).toBe('B3:1/1');
    expect(f('MW5', 'ab')).toBe('N7:5');
    expect(f('MD2', 'ab')).toBe('F8:2');
    expect(f('T3', 'ab')).toBe('T4:3/DN');
    expect(f('T3.ET', 'ab')).toBe('T4:3.ACC');
    expect(f('T3.PT', 'ab')).toBe('T4:3.PRE');
    expect(f('C1.CV', 'ab')).toBe('C5:1.ACC');
    expect(f('S0.1', 'ab')).toBe('S:1/15');
  });

  it('Mitsubishi (FX) uses octal for X/Y', () => {
    expect(f('I0.7', 'mitsubishi')).toBe('X7');
    expect(f('I1.0', 'mitsubishi')).toBe('X10');
    expect(f('I1.7', 'mitsubishi')).toBe('X17');
    expect(f('Q1.2', 'mitsubishi')).toBe('Y12');
    expect(f('M1.0', 'mitsubishi')).toBe('M8');
    expect(f('MW4', 'mitsubishi')).toBe('D4');
    expect(f('T2', 'mitsubishi')).toBe('T2');
    expect(f('S0.0', 'mitsubishi')).toBe('M8000');
    expect(f('S0.1', 'mitsubishi')).toBe('M8002');
    expect(f('IW0', 'mitsubishi')).toBe('IW0'); // no faithful equivalent: generic
  });

  it('Omron (CP1)', () => {
    expect(f('I0.0', 'omron')).toBe('0.00');
    expect(f('I1.7', 'omron')).toBe('0.15');
    expect(f('Q0.3', 'omron')).toBe('100.03');
    expect(f('M3.2', 'omron')).toBe('W1.10');
    expect(f('MW7', 'omron')).toBe('D7');
    expect(f('IW1', 'omron')).toBe('201');
    expect(f('QW0', 'omron')).toBe('210');
    expect(f('T5', 'omron')).toBe('T0005');
    expect(f('C12', 'omron')).toBe('C0012');
    expect(f('S0.1', 'omron')).toBe('P_First_Cycle');
  });

  it('leaves non-addresses untouched', () => {
    expect(f('T#5s', 'siemens')).toBe('T#5s');
    expect(f('MOTOR', 'ab')).toBe('MOTOR');
  });
});
