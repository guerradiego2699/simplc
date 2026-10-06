import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { tag } from '@/simulator/project/tags';
import { compileSt } from '../compile';

const TAGS = [
  tag('MARCHA', 'I0.0'),
  tag('PARO', 'I0.1'),
  tag('MOTOR', 'Q0.0'),
  tag('CICLO', 'T0'),
  tag('CUENTA', 'MW0'),
];

/** Compiles (expecting no errors), starts a runtime and returns it. */
function run(source: string, tags = TAGS) {
  const result = compileSt(source, tags);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const rt = new PlcRuntime();
  rt.load(result.ir!);
  rt.start();
  return rt;
}

const errors = (source: string, tags = TAGS) =>
  compileSt(source, tags).diagnostics.filter((d) => d.severity === 'error');

describe('ST: basics', () => {
  it('start/stop with seal-in, case-insensitive names and keywords', () => {
    const rt = run(`
      (* seal-in *)
      motor := (Marcha OR MOTOR) and paro; // comment
    `);
    rt.setInput('I0.1', true);
    rt.setInput('I0.0', true);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.0', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.1', false);
    rt.scan();
    expect(rt.getOutput('Q0.0')).toBe(false);
  });

  it('accepts PROGRAM … END_PROGRAM, direct addresses and IEC addresses', () => {
    const rt = run(`
      PROGRAM Main
        Q0.1 := I0.2 AND NOT %IX0.3;
        %QX0.2 := I0.2 XOR I0.3;
      END_PROGRAM
    `);
    rt.setInput('I0.2', true);
    rt.scan();
    expect(rt.getOutput('Q0.1')).toBe(true);
    expect(rt.getOutput('Q0.2')).toBe(true);
  });

  it('numbers: INT wraps, REAL maths, conversions, based literals and precedence', () => {
    const rt = run(`
      MW1 := 2 + 3 * 4;            (* 14 *)
      MW2 := (2 + 3) * 4;          (* 20 *)
      MW3 := 16#FF;                (* 255 *)
      MW4 := 32767 + 1;            (* wraps to -32768 *)
      MD0 := TO_REAL(MW1) / 4.0;   (* 3.5 *)
      MW5 := REAL_TO_INT(MD0);     (* 3 *)
      MW6 := -MW1 MOD 5;           (* -4 *)
      Q0.3 := MW1 > 10 AND MW2 = 20;
    `);
    rt.scan();
    expect(rt.read('MW1')).toBe(14);
    expect(rt.read('MW2')).toBe(20);
    expect(rt.read('MW3')).toBe(255);
    expect(rt.read('MW4')).toBe(-32768);
    expect(rt.read('MD0')).toBe(3.5);
    expect(rt.read('MW5')).toBe(3);
    expect(rt.read('MW6')).toBe(-4);
    expect(rt.getOutput('Q0.3')).toBe(true);
  });
});

describe('ST: control flow', () => {
  it('IF / ELSIF / ELSE', () => {
    const rt = run(`
      IF MW0 < 10 THEN MW1 := 1;
      ELSIF MW0 < 20 THEN MW1 := 2;
      ELSE MW1 := 3;
      END_IF;
    `);
    for (const [v, expected] of [
      [5, 1],
      [15, 2],
      [25, 3],
    ] as const) {
      rt.write('MW0', v);
      rt.scan();
      expect(rt.read('MW1')).toBe(expected);
    }
  });

  it('CASE with lists, ranges, negative labels and ELSE', () => {
    const rt = run(`
      CASE CUENTA OF
        1, 2: MW1 := 10;
        3..5: MW1 := 20;
        -1: MW1 := 30;
      ELSE
        MW1 := 0;
      END_CASE
    `);
    for (const [v, expected] of [
      [2, 10],
      [4, 20],
      [-1, 30],
      [9, 0],
    ] as const) {
      rt.write('MW0', v);
      rt.scan();
      expect(rt.read('MW1')).toBe(expected);
    }
  });

  it('FOR (up, down with BY), WHILE with EXIT and REPEAT', () => {
    const rt = run(`
      MW1 := 0;
      FOR MW2 := 1 TO 10 DO MW1 := MW1 + MW2; END_FOR;          (* 55 *)
      MW3 := 0;
      FOR MW2 := 10 TO 1 BY -3 DO MW3 := MW3 + 1; END_FOR;     (* 10,7,4,1 → 4 *)
      MW4 := 0;
      WHILE TRUE DO
        MW4 := MW4 + 1;
        IF MW4 >= 7 THEN EXIT; END_IF;
      END_WHILE;
      MW5 := 100;
      REPEAT MW5 := MW5 + 1; UNTIL TRUE END_REPEAT;            (* body runs once *)
    `);
    rt.scan();
    expect(rt.read('MW1')).toBe(55);
    expect(rt.read('MW3')).toBe(4);
    expect(rt.read('MW4')).toBe(7);
    expect(rt.read('MW5')).toBe(101);
  });

  it('an endless loop trips the watchdog instead of freezing', () => {
    const rt = run('WHILE TRUE DO MW1 := MW1 + 1; END_WHILE;');
    rt.scan();
    expect(rt.mode).toBe('STOP');
    expect(rt.fault?.code).toBe('WATCHDOG');
  });
});

describe('ST: VAR and function blocks', () => {
  it('locals keep their value between scans and initialise on the first scan', () => {
    const rt = run(`
      VAR
        veces : INT := 5;
        listo : BOOL;
      END_VAR
      veces := veces + 1;
      listo := veces >= 8;
      Q0.4 := listo;
    `);
    rt.scan();
    rt.scan();
    expect(rt.getOutput('Q0.4')).toBe(false);
    rt.scan(); // 6, 7, 8
    expect(rt.getOutput('Q0.4')).toBe(true);
    const symbols = compileSt('VAR veces : INT; END_VAR', TAGS).symbols;
    expect(symbols.find((s) => s.name === 'veces')).toMatchObject({
      origin: 'local',
      address: 'MW63',
    });
  });

  it('TON declared on a tag (CICLO → T0) with T#, reading .Q and .ET', () => {
    const rt = run(`
      VAR CICLO : TON; END_VAR
      CICLO(IN := MARCHA, PT := T#1s);
      MOTOR := CICLO.Q;
      Q0.5 := CICLO.ET >= T#500ms;
    `);
    rt.setInput('I0.0', true);
    rt.advance(600);
    expect(rt.getOutput('Q0.5')).toBe(true);
    expect(rt.getOutput('Q0.0')).toBe(false);
    rt.advance(500);
    expect(rt.getOutput('Q0.0')).toBe(true);
  });

  it('CTU on a free counter, R_TRIG detects each press once', () => {
    const rt = run(`
      VAR
        contador : CTU;
        flanco : R_TRIG;
      END_VAR
      flanco(CLK := MARCHA);
      IF flanco.Q THEN MW10 := MW10 + 1; END_IF;
      contador(CU := MARCHA, R := PARO, PV := 3);
      MOTOR := contador.Q;
      MW11 := contador.CV;
    `);
    for (let k = 0; k < 3; k++) {
      rt.setInput('I0.0', true);
      rt.scan();
      rt.scan(); // held: counted once
      rt.setInput('I0.0', false);
      rt.scan();
    }
    expect(rt.read('MW10')).toBe(3);
    expect(rt.read('MW11')).toBe(3);
    expect(rt.getOutput('Q0.0')).toBe(true);
    rt.setInput('I0.1', true);
    rt.scan();
    expect(rt.read('MW11')).toBe(0);
  });
});

describe('ST: diagnostics with positions', () => {
  it('syntax errors point at the token', () => {
    const [e] = errors('MOTOR := MARCHA\nPARO := 1;');
    expect(e).toMatchObject({
      code: 'ST_SYNTAX',
      params: { expected: ';', found: 'PARO' },
      range: { start: { line: 2, col: 1 } },
    });
    expect(errors('IF MARCHA THEN MOTOR := TRUE;')[0]).toMatchObject({
      code: 'ST_SYNTAX',
      params: { expected: 'END_IF' },
    });
    expect(errors('(* never closed')[0]?.code).toBe('ST_UNCLOSED_COMMENT');
    expect(errors('MOTOR := MARCHA $ PARO;')[0]?.code).toBe('ST_BAD_CHAR');
  });

  it('semantic errors', () => {
    expect(errors('MOTOR := ENCENDIDO;')[0]).toMatchObject({
      code: 'ST_UNKNOWN_NAME',
      params: { name: 'ENCENDIDO' },
      range: { start: { line: 1, col: 10 }, end: { line: 1, col: 19 } },
    });
    expect(errors('CICLO(IN := MARCHA, PT := T#1s);')[0]?.code).toBe('ST_UNDECLARED_FB');
    expect(errors('VAR t : TON; END_VAR t(IN := MARCHA);')[0]).toMatchObject({
      code: 'ST_MISSING_PARAM',
      params: { param: 'PT' },
    });
    expect(errors('VAR t : TON; END_VAR t(IN := MARCHA, PT := T#1s, Q := 1);')[0]?.code).toBe(
      'ST_UNKNOWN_PARAM',
    );
    expect(errors('EXIT;')[0]?.code).toBe('ST_EXIT_OUTSIDE_LOOP');
    expect(errors('MW1 := 2 ** 3;')[0]?.code).toBe('ST_UNSUPPORTED');
    expect(errors('VAR MARCHA : BOOL; END_VAR')[0]?.code).toBe('ST_NAME_CONFLICT');
    expect(errors('VAR x : DINT; END_VAR')[0]?.code).toBe('ST_UNKNOWN_TYPE');
    expect(errors('CICLO.ET := T#1s;')[0]?.code).toBe('ST_NOT_WRITABLE');
    expect(errors('MW1 := ABS(MW2);')[0]?.code).toBe('ST_UNKNOWN_FUNCTION');
  });

  it('engine type errors are mapped back to the source range', () => {
    const [e] = errors('MOTOR := MW1 + 1;');
    expect(e).toMatchObject({ code: 'TYPE_MISMATCH', range: { start: { line: 1, col: 1 } } });
    expect(errors('IF MW1 THEN MOTOR := TRUE; END_IF;')[0]).toMatchObject({
      code: 'TYPE_MISMATCH',
      range: { start: { line: 1, col: 4 } },
    });
  });

  it('an empty program compiles to an empty network', () => {
    const result = compileSt('  (* nothing yet *)  ', TAGS);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.networks[0]?.body).toEqual([]);
  });
});
