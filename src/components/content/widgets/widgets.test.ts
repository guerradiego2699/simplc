import { describe, expect, it } from 'vitest';
import { INITIAL, reducer, type State } from './ScanCycleDiagram';
import { isCurrentFault, levelToMilliamps, levelToVolts } from './AnalogSignalDemo';
import { COM_WIRE, CURRENT_PATH } from './SensorWiringDiagram';

const advance = (s: State, times = 1) => {
  let state = s;
  for (let i = 0; i < times; i++) state = reducer(state, { type: 'advance' });
  return state;
};

describe('scan cycle model', () => {
  it('starts at "read inputs" in cycle 1 with everything off', () => {
    expect(INITIAL.phaseIndex).toBe(0);
    expect(INITIAL.cycle).toBe(1);
    expect(INITIAL.io).toEqual({
      physIn: false,
      inputImage: false,
      outputImage: false,
      physOut: false,
    });
  });

  it('an input change only reaches the output after read → execute → write', () => {
    // Flip the switch while in "read inputs": it was already read, so nothing changes yet.
    let s = reducer(INITIAL, { type: 'toggleInput' });
    expect(s.io.inputImage).toBe(false);

    s = advance(s); // execute
    expect(s.io.outputImage).toBe(false);
    s = advance(s, 2); // write, housekeeping
    expect(s.io.physOut).toBe(false);

    s = advance(s); // read (cycle 2)
    expect(s.cycle).toBe(2);
    expect(s.io.inputImage).toBe(true);
    expect(s.io.outputImage).toBe(false);

    s = advance(s); // execute
    expect(s.io.outputImage).toBe(true);
    expect(s.io.physOut).toBe(false);

    s = advance(s); // write
    expect(s.io.physOut).toBe(true);
  });

  it('counts one cycle every four phases', () => {
    expect(advance(INITIAL, 8).cycle).toBe(3);
    expect(advance(INITIAL, 8).phaseIndex).toBe(0);
  });
});

describe('analog signal', () => {
  it('maps 0–100 % to 4–20 mA and 0–10 V', () => {
    expect(levelToMilliamps(0)).toBe(4);
    expect(levelToMilliamps(50)).toBe(12);
    expect(levelToMilliamps(100)).toBe(20);
    expect(levelToVolts(0)).toBe(0);
    expect(levelToVolts(100)).toBe(10);
  });

  it('flags currents outside the NAMUR NE 43 window as faults', () => {
    expect(isCurrentFault(0)).toBe(true);
    expect(isCurrentFault(3.5)).toBe(true);
    expect(isCurrentFault(4)).toBe(false);
    expect(isCurrentFault(20)).toBe(false);
    expect(isCurrentFault(21.5)).toBe(true);
  });
});

describe('sensor wiring', () => {
  it('PNP current enters I0.0 from the sensor; NPN current leaves I0.0 towards the sensor', () => {
    // PNP path reaches the I0.0 terminal (380,150) coming from the sensor side (H380 after L240 150).
    expect(CURRENT_PATH.pnp).toMatch(/L240 150 H380 H450/);
    // NPN path goes from the module back to the sensor (H380 H240).
    expect(CURRENT_PATH.npn).toMatch(/H380 H240/);
  });

  it('wires the common to 0 V for PNP and to +24 V for NPN', () => {
    expect(COM_WIRE.pnp).toMatch(/V260$/); // 0 V rail
    expect(COM_WIRE.npn).toMatch(/V40$/); // +24 V rail
  });
});

describe('terminals diagram', () => {
  it('every clickable part has a name, a description and wiring help in both languages', async () => {
    const { PARTS, TOP_TERMINALS, BOTTOM_TERMINALS } = await import('./TerminalDiagram');
    const es = (await import('@/i18n/es.json')).default.widgets.terminals.parts;
    const en = (await import('@/i18n/en.json')).default.widgets.terminals.parts;
    for (const part of PARTS) {
      for (const dict of [es, en]) {
        expect(dict[part].name.length).toBeGreaterThan(0);
        expect(dict[part].what.length).toBeGreaterThan(0);
        expect(dict[part].connect.length).toBeGreaterThan(0);
      }
    }
    // Every terminal belongs to a known part and labels are unique.
    const labels = [...TOP_TERMINALS, ...BOTTOM_TERMINALS].map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const t of [...TOP_TERMINALS, ...BOTTOM_TERMINALS]) expect(PARTS).toContain(t.part);
  });
});
