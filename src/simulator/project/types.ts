/**
 * A simulator project: the program, its variable table and the I/O panel setup.
 * Phase 6 turns this into the downloadable .simplc.json format (with schema validation).
 */
import type { LadderProgram } from '@/simulator/languages/ladder/model';

export type Language = 'LD' | 'ST' | 'FBD' | 'IL' | 'SFC';

/** A symbolic name for an address (IEC "variable" / brand "tag" or "symbol"). */
export interface Tag {
  id: string;
  name: string;
  address: string;
  comment: string;
}

/**
 * How each digital input of the training panel behaves:
 * - switch: maintained toggle switch
 * - button-no: momentary push button, normally open (1 while pressed)
 * - button-nc: momentary push button, normally closed (0 while pressed) — e.g. a stop button
 */
export type InputMode = 'switch' | 'button-no' | 'button-nc';

export interface IoPanelSetup {
  /** Keyed by input address ("I0.0"). Missing entries use defaults. */
  inputs: Record<string, { label?: string; mode?: InputMode }>;
  outputs: Record<string, { label?: string }>;
}

export interface Project {
  /** Shown in the toolbar and used as the download file name. Empty = untitled. */
  name: string;
  language: Language;
  ladder: LadderProgram;
  tags: Tag[];
  io: IoPanelSetup;
  /** Virtual plant connected to the I/O (Phase 7), or null. */
  plant: string | null;
}
