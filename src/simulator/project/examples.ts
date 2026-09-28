/**
 * Built-in starter projects. Visible texts (tag names, comments, labels) come from the caller
 * so they follow the UI language. The full example gallery arrives in Phase 7.
 */
import {
  coil,
  contact,
  emptyProgram,
  parallel,
  rung,
  series,
} from '@/simulator/languages/ladder/model';
import { tag } from './tags';
import type { Project } from './types';

export function emptyProject(): Project {
  return { language: 'LD', ladder: emptyProgram(), tags: [], io: { inputs: {}, outputs: {} } };
}

export interface MotorExampleTexts {
  start: string;
  stop: string;
  motor: string;
  startComment: string;
  stopComment: string;
  motorComment: string;
  rungComment: string;
}

/**
 * Start/stop with seal-in, wired the industrial way: STOP is an NC push button, so the input is
 * 1 at rest and the program examines it with a normally-open contact.
 */
export function motorStartStopProject(t: MotorExampleTexts): Project {
  return {
    language: 'LD',
    ladder: {
      rungs: [
        rung(
          [
            parallel(series([contact('NO', t.start)]), series([contact('NO', t.motor)])),
            contact('NO', t.stop),
          ],
          [coil('coil', t.motor)],
          t.rungComment,
        ),
      ],
    },
    tags: [
      tag(t.start, 'I0.0', t.startComment),
      tag(t.stop, 'I0.1', t.stopComment),
      tag(t.motor, 'Q0.0', t.motorComment),
    ],
    io: {
      inputs: {
        'I0.0': { label: t.start, mode: 'button-no' },
        'I0.1': { label: t.stop, mode: 'button-nc' },
      },
      outputs: { 'Q0.0': { label: t.motor } },
    },
  };
}
