/**
 * Terminal demo of the PLC engine (Phase 3 has no UI yet).
 * Run with: npm run engine:demo
 *
 * Program (Ladder equivalent):
 *   Rung 1:  ──┤ I0.0 MARCHA ├──┬──┤ I0.1 PARO(NC) ├────( Q0.0 MOTOR )
 *              ┤ Q0.0 MOTOR  ├──┘
 *   Rung 2:  ──┤P I0.2 PULSADOR ├──────────────────────( Q0.1 PULSO )
 */
import { PlcRuntime } from '@/simulator/engine';
import { and, assign, network, no, or, program, read, rising } from '@/simulator/ir/builders';

const plc = new PlcRuntime({ cycleTimeMs: 10 });
plc.load(
  program(
    network('motor', [assign('Q0.0', and(or(no('I0.0'), read('Q0.0')), no('I0.1')))]),
    network('pulse', [assign('Q0.1', rising(no('I0.2'), 'pulse'))]),
  ),
);
plc.start();
plc.setInput('I0.1', true); // botón de paro NC: en reposo la entrada está en 1

const steps: { inputs?: Record<string, boolean>; note: string }[] = [
  { note: 'Reposo: motor detenido' },
  { inputs: { 'I0.0': true }, note: 'Se presiona MARCHA' },
  { inputs: { 'I0.0': false }, note: 'Se suelta MARCHA: la autorretención mantiene el motor' },
  { note: 'Sigue en marcha' },
  { inputs: { 'I0.1': false }, note: 'Se presiona PARO (o se corta el cable)' },
  { inputs: { 'I0.1': true }, note: 'Se suelta PARO: el motor queda detenido' },
  { inputs: { 'I0.2': true }, note: 'Se presiona PULSADOR: flanco de subida' },
  { note: 'PULSADOR sigue presionado: el pulso dura solo un ciclo' },
  { inputs: { 'I0.2': false }, note: 'Se suelta PULSADOR' },
];

const bit = (v: boolean) => (v ? '■ 1' : '· 0');
const cols = [
  'Ciclo',
  'Tiempo',
  'MARCHA I0.0',
  'PARO I0.1',
  'PULSADOR I0.2',
  'MOTOR Q0.0',
  'PULSO Q0.1',
];
const widths = [5, 7, 11, 9, 13, 10, 10];
const row = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 8)).join(' │ ');

console.log('\nPLCampus — demostración del motor PLC (Fase 3)\n');
console.log(row(cols));
console.log(widths.map((w) => '─'.repeat(w)).join('─┼─'));
for (const step of steps) {
  for (const [address, value] of Object.entries(step.inputs ?? {})) plc.setInput(address, value);
  plc.scan();
  console.log(
    row([
      String(plc.scanCount),
      `${plc.timeMs - plc.cycleTimeMs} ms`,
      bit(plc.getInput('I0.0')),
      bit(plc.getInput('I0.1')),
      bit(plc.getInput('I0.2')),
      bit(plc.getOutput('Q0.0')),
      bit(plc.getOutput('Q0.1')),
    ]) + `   ← ${step.note}`,
  );
}
console.log(
  '\nCada fila es un ciclo de scan completo (leer entradas → ejecutar → escribir salidas).\n',
);
