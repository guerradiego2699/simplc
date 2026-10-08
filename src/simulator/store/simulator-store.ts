/**
 * Simulator state (Zustand): project + undo/redo, compilation, selection, drag & drop,
 * simulation status and UI layout. The PLC runtime itself lives in `controller.ts`.
 */
import { create } from 'zustand';
import { parseInstance, type MemorySnapshot, type ScanEvent, type Value } from '@/simulator/engine';
import { ADDRESS_STYLES, type AddressStyle } from '@/simulator/addressing/styles';
import { spec } from '@/simulator/languages/ladder/catalog';
import { compileProject, type ProjectCompileResult } from '@/simulator/project/compile-project';
import {
  addRung,
  allElements,
  coil,
  contact,
  deleteRung,
  insertAt,
  locate,
  moveElement,
  removeElement,
  wrapInParallel,
  type CoilType,
  type ContactType,
  type Element,
  type InsertTarget,
  type LadderProgram,
} from '@/simulator/languages/ladder/model';
import type { Validation } from '@/simulator/challenges/validator';
import { resolveOperand } from '@/simulator/project/tags';
import { removeStep, removeTransition } from '@/simulator/languages/sfc/model';
import type { Project } from '@/simulator/project/types';

export type SimStatus = 'stopped' | 'running' | 'paused';

export type Selection =
  | { kind: 'element'; id: string }
  | { kind: 'rung'; id: string }
  /** Consecutive contacts of one series (Shift + click), e.g. to wrap them in a branch. */
  | { kind: 'range'; seriesId: string; ids: string[] }
  | null;

export type PaletteItem = { kind: 'contact'; type: ContactType } | { kind: 'coil'; type: CoilType };

export type DragItem =
  | ({ source: 'palette' } & PaletteItem)
  | { source: 'element'; id: string; kind: 'contact' | 'coil' | 'parallel' };

export interface DragState {
  item: DragItem;
  x: number;
  y: number;
  /** Key of the drop zone under the pointer ("<rungId>:<index>"), if any. */
  zoneKey: string | null;
  target: InsertTarget | null;
}

export type RightTab = 'properties' | 'variables' | 'monitor' | 'challenge';
export type BottomTab = 'io' | 'console' | 'scan' | 'plant';

export interface Notice {
  kind: 'info' | 'error';
  text: string;
  /** Changes on every notice so repeated messages are announced again. */
  id: number;
}

/** State of the "visualize scan" mode (spec 6.2). */
export interface ScanView {
  active: boolean;
  /** Advances automatically (true) or only with "next step". */
  auto: boolean;
  /** Last completed part of the scan. */
  event: ScanEvent | null;
}

/** UI state of the challenge being solved; survives tab switches (not saved). */
export interface ChallengeSession {
  id: string;
  hintsShown: number;
  /** Last check and the program it checked (to tell when it is out of date). */
  result: { validation: Validation; ladder: LadderProgram } | null;
}

/** What is selected in the SFC editor. */
export interface SfcSelection {
  kind: 'step' | 'transition';
  id: string;
}

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export const ZOOM = { min: 0.5, max: 2, step: 0.1 } as const;
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export interface SimulatorState {
  project: Project;
  past: Project[];
  future: Project[];
  /**
   * Changes whenever a DIFFERENT project takes over (new, example, opened file, or undo/redo
   * across one of those). The controller then resets the PLC instead of an online change, so
   * nothing from the previous project (memory, forces, panel controls, time) leaks into it.
   */
  projectSwitch: number;
  compiled: ProjectCompileResult;
  /** Ask the ST editor to move the cursor (from the console); `id` changes on every request. */
  stReveal: { line: number; col: number; id: number } | null;
  selection: Selection;
  /** Selected step or transition in the SFC editor. */
  sfcSelection: SfcSelection | null;
  /** Ask the properties panel to focus the operand field (after inserting an element). */
  focusOperand: number;
  drag: DragState | null;

  status: SimStatus;
  speed: number;
  snapshot: MemorySnapshot | null;
  probes: Record<string, Value>;
  scanView: ScanView;
  /** State of the virtual plant (shape depends on `project.plant`), published by the controller. */
  plantState: unknown;
  challengeSession: ChallengeSession | null;
  addressStyle: AddressStyle;
  /** Short message shown over the editor (file opened, file errors…). */
  notice: Notice | null;
  /** Result of the last autosave (null = not attempted yet). */
  autosave: 'saved' | 'unavailable' | null;
  /** RUN/PAUSE with a program that has errors: the PLC keeps the last good program. */
  notLoaded: boolean;
  /** Physical state of each panel control (switch on / button pressed), by input address. */
  ioControls: Record<string, boolean>;
  /** Potentiometers of the panel's analog inputs (raw value 0–27648), by address (IW0…). */
  analogInputs: Record<string, number>;

  zoom: number;
  rightWidth: number;
  bottomHeight: number;
  rightTab: RightTab;
  bottomTab: BottomTab;
}

interface Actions {
  /** Applies a project change (undoable). Same `coalesceKey` within 1 s = one undo step. */
  commit(update: (p: Project) => Project, coalesceKey?: string): void;
  undo(): void;
  redo(): void;
  select(selection: Selection): void;
  selectSfc(selection: SfcSelection | null): void;
  /** Deletes the selected SFC step (with its transitions) or transition. Undoable. */
  deleteSfcSelection(): void;
  insertFromPalette(item: PaletteItem): void;
  dropAt(target: InsertTarget, item: DragItem): void;
  deleteSelection(): void;
  wrapSelection(): void;
  addRungAfterSelection(): void;
  setDrag(drag: DragState | null): void;
  setIoControl(address: string, value: boolean): void;
  setAnalogInput(address: string, value: number): void;
  setZoom(zoom: number): void;
  setAddressStyle(style: AddressStyle): void;
  /** Replaces the whole project (new, example, opened file). Undoable. */
  replaceProject(project: Project): void;
  setNotice(notice: Notice | null): void;
  setLayout(
    patch: Partial<Pick<SimulatorState, 'rightWidth' | 'bottomHeight' | 'rightTab' | 'bottomTab'>>,
  ): void;
}

export type SimulatorStore = SimulatorState & Actions;

let lastCommit: { key: string; at: number } | null = null;

const STYLE_KEY = 'plcampus:addressStyle';

function loadAddressStyle(): AddressStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return (ADDRESS_STYLES as readonly string[]).includes(v ?? '')
      ? (v as AddressStyle)
      : 'generic';
  } catch {
    return 'generic';
  }
}

/** First timer (T) or counter (C) instance not used by any element of the project. */
export function nextFreeInstance(project: Project, kind: 'timer' | 'counter'): string {
  const used = new Set<number>();
  for (const el of allElements(project.ladder)) {
    const family = spec(el.type).family;
    if (family !== kind) continue;
    const res = resolveOperand(el.operand, project.tags);
    const index = res.ok ? parseInstance(res.address, kind) : null;
    if (index !== null) used.add(index);
  }
  let n = 0;
  while (used.has(n)) n++;
  return `${kind === 'timer' ? 'T' : 'C'}${n}`;
}

/** A new element from the palette; timers and counters get the first free instance. */
function newElement(item: PaletteItem, project: Project): Element {
  if (item.kind === 'coil') return coil(item.type);
  const family = spec(item.type).family;
  const operand =
    family === 'timer' || family === 'counter' ? nextFreeInstance(project, family) : '';
  return contact(item.type, operand);
}

/** Where a palette click inserts, given the current selection. */
function clickTarget(
  project: Project,
  selection: Selection,
  item: PaletteItem,
): InsertTarget | null {
  const rungs = project.ladder.rungs;
  const lastRung = rungs[rungs.length - 1];
  let rungId = lastRung?.id;

  const selectedId =
    selection?.kind === 'element'
      ? selection.id
      : selection?.kind === 'range'
        ? selection.ids[selection.ids.length - 1]
        : undefined;

  if (selectedId) {
    const where = locate(project.ladder, selectedId);
    if (where) {
      rungId = where.rung.id;
      if (item.kind === 'contact' && where.series) {
        return { kind: 'series', seriesId: where.series.id, index: where.index + 1 };
      }
      if (item.kind === 'coil' && where.node.kind === 'coil') {
        return { kind: 'coil', rungId, index: where.index + 1 };
      }
    }
  } else if (selection?.kind === 'rung') {
    rungId = selection.id;
  }

  const r = rungs.find((x) => x.id === rungId);
  if (!r) return null;
  return item.kind === 'contact'
    ? { kind: 'series', seriesId: r.logic.id, index: r.logic.items.length }
    : { kind: 'coil', rungId: r.id, index: r.coils.length };
}

export function createSimulatorStore(initial: Project) {
  /** Projects that entered the history through replaceProject (whole-project switches). */
  const replacements = new WeakSet<Project>();
  return create<SimulatorStore>()((set, get) => {
    /** Announces a project switch BEFORE the new project is applied, and clears panel controls. */
    const switchProject = () =>
      set({
        projectSwitch: get().projectSwitch + 1,
        ioControls: {},
        analogInputs: {},
        selection: null,
        sfcSelection: null,
        drag: null,
      });
    const apply = (project: Project, pushHistory: boolean, coalesceKey?: string) => {
      const { project: before, past } = get();
      if (project === before) return;
      const now = performance.now();
      const coalesce =
        coalesceKey !== undefined &&
        lastCommit?.key === coalesceKey &&
        now - lastCommit.at < COALESCE_MS;
      lastCommit = coalesceKey ? { key: coalesceKey, at: now } : null;
      set({
        project,
        compiled: compileProject(project),
        ...(pushHistory
          ? { past: coalesce ? past : [...past, before].slice(-HISTORY_LIMIT), future: [] }
          : {}),
      });
    };

    const selectInserted = (id: string) => {
      if (!locate(get().project.ladder, id)) return;
      set({ selection: { kind: 'element', id }, rightTab: 'properties', focusOperand: Date.now() });
    };

    return {
      project: initial,
      past: [],
      future: [],
      projectSwitch: 0,
      compiled: compileProject(initial),
      stReveal: null,
      sfcSelection: null,
      selection: null,
      focusOperand: 0,
      drag: null,

      status: 'stopped',
      speed: 1,
      snapshot: null,
      probes: {},
      notLoaded: false,
      ioControls: {},
      analogInputs: {},
      scanView: { active: false, auto: true, event: null },
      plantState: null,
      challengeSession: null,
      addressStyle: loadAddressStyle(),
      notice: null,
      autosave: null,

      zoom: 1,
      rightWidth: 320,
      bottomHeight: 262,
      rightTab: 'properties',
      bottomTab: 'io',

      commit(update, coalesceKey) {
        apply(update(get().project), true, coalesceKey);
      },

      undo() {
        const { past, project, future } = get();
        const previous = past[past.length - 1];
        if (!previous) return;
        lastCommit = null;
        if (replacements.has(project)) switchProject();
        set({ past: past.slice(0, -1), future: [project, ...future] });
        apply(previous, false);
      },

      redo() {
        const { past, project, future } = get();
        const next = future[0];
        if (!next) return;
        lastCommit = null;
        if (replacements.has(next)) switchProject();
        set({ past: [...past, project], future: future.slice(1) });
        apply(next, false);
      },

      select(selection) {
        set({ selection, rightTab: selection ? 'properties' : get().rightTab });
      },

      insertFromPalette(item) {
        const { project, selection } = get();
        const target = clickTarget(project, selection, item);
        if (!target) return;
        const element = newElement(item, get().project);
        get().commit((p) => ({ ...p, ladder: insertAt(p.ladder, target, element) }));
        selectInserted(element.id);
      },

      dropAt(target, item) {
        if (item.source === 'palette') {
          const element = newElement(item, get().project);
          get().commit((p) => ({ ...p, ladder: insertAt(p.ladder, target, element) }));
          selectInserted(element.id);
        } else {
          get().commit((p) => ({ ...p, ladder: moveElement(p.ladder, item.id, target) }));
          set({ selection: { kind: 'element', id: item.id } });
        }
      },

      deleteSelection() {
        const { selection } = get();
        if (!selection) return;
        get().commit((p) => {
          if (selection.kind === 'rung')
            return { ...p, ladder: deleteRung(p.ladder, selection.id) };
          const ids = selection.kind === 'range' ? selection.ids : [selection.id];
          return { ...p, ladder: ids.reduce((l, id) => removeElement(l, id), p.ladder) };
        });
        set({ selection: null });
      },

      wrapSelection() {
        const { selection, project } = get();
        let seriesId: string | undefined;
        let ids: string[] = [];
        if (selection?.kind === 'range') {
          seriesId = selection.seriesId;
          ids = selection.ids;
        } else if (selection?.kind === 'element') {
          seriesId = locate(project.ladder, selection.id)?.series?.id;
          ids = [selection.id];
        }
        if (!seriesId || ids.length === 0) return;
        const indexes = ids
          .map((id) => locate(project.ladder, id)?.index)
          .filter((i): i is number => i !== undefined);
        const result = wrapInParallel(
          project.ladder,
          seriesId,
          Math.min(...indexes),
          Math.max(...indexes),
        );
        if (!result.parallelId) return;
        get().commit((p) => ({ ...p, ladder: result.program }));
        set({ selection: { kind: 'element', id: result.parallelId } });
      },

      addRungAfterSelection() {
        const { selection, project } = get();
        const rungs = project.ladder.rungs;
        let index = rungs.length - 1;
        if (selection?.kind === 'rung') index = rungs.findIndex((r) => r.id === selection.id);
        else if (selection?.kind === 'element')
          index = locate(project.ladder, selection.id)?.rungIndex ?? index;
        const result = addRung(project.ladder, index);
        get().commit((p) => ({ ...p, ladder: result.program }));
        set({ selection: { kind: 'rung', id: result.rungId } });
      },

      setDrag(drag) {
        set({ drag });
      },

      setIoControl(address, value) {
        set({ ioControls: { ...get().ioControls, [address]: value } });
      },

      setAnalogInput(address, value) {
        set({ analogInputs: { ...get().analogInputs, [address]: value } });
      },

      setZoom(zoom) {
        const z = Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, zoom)) * 100) / 100;
        set({ zoom: z });
      },

      setLayout(patch) {
        set(patch);
      },

      replaceProject(project) {
        lastCommit = null;
        replacements.add(project);
        switchProject();
        get().commit(() => project);
      },

      selectSfc(sfcSelection) {
        set({ sfcSelection });
      },

      deleteSfcSelection() {
        const sel = get().sfcSelection;
        if (!sel) return;
        get().commit((p) =>
          p.sfc
            ? {
                ...p,
                sfc:
                  sel.kind === 'step' ? removeStep(p.sfc, sel.id) : removeTransition(p.sfc, sel.id),
              }
            : p,
        );
        set({ sfcSelection: null });
      },

      setNotice(notice) {
        set({ notice });
      },

      setAddressStyle(addressStyle) {
        set({ addressStyle });
        try {
          localStorage.setItem(STYLE_KEY, addressStyle);
        } catch {
          // Storage blocked: the choice lasts for this page view.
        }
      },
    };
  });
}

export type SimulatorStoreApi = ReturnType<typeof createSimulatorStore>;
