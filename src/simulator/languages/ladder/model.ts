/**
 * Ladder (LD) program model.
 *
 * A rung is a series–parallel tree of contacts ending in one or more coils (in parallel at the
 * right rail), which is what IEC 61131-3 Ladder allows in practice and keeps every rung
 * compilable and convertible to other languages. All operations are pure: they return a new
 * program and never mutate their input (this is what makes undo/redo trivial).
 */

import { LOGIC_TYPES, OUTPUT_TYPES, spec, type LogicType, type OutputType } from './catalog';

/** Logic-side instructions: contacts, compare contacts, timer and counter boxes. */
export type ContactType = LogicType;
/** Output-side instructions: coils and MOVE / math / SCALE boxes. */
export type CoilType = OutputType;

export interface Contact {
  kind: 'contact';
  id: string;
  type: ContactType;
  /** Address ("I0.0") or tag name ("START"). Empty until the user assigns it. */
  operand: string;
  /** Extra operands by key (see catalog.ts), e.g. { pt: 'T#5s' } for a timer. */
  params?: Record<string, string>;
}

export interface Coil {
  kind: 'coil';
  id: string;
  type: CoilType;
  operand: string;
  /** Extra operands by key (see catalog.ts), e.g. { pt: 'T#5s' } for a timer. */
  params?: Record<string, string>;
}

export interface Series {
  id: string;
  items: LogicNode[];
}

export interface Parallel {
  kind: 'parallel';
  id: string;
  /** Two or more branches; an empty branch is a plain wire (a bypass). */
  branches: Series[];
}

export type LogicNode = Contact | Parallel;
export type Element = Contact | Coil;

export interface Rung {
  id: string;
  comment: string;
  logic: Series;
  coils: Coil[];
}

export interface LadderProgram {
  rungs: Rung[];
}

// ---------------------------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------------------------

let counter = 0;

/** Short unique id. Random part avoids collisions with ids loaded from files. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------------------------

export const contact = (
  type: ContactType,
  operand = '',
  params: Record<string, string> = { ...spec(type).defaults },
): Contact => ({
  kind: 'contact',
  id: newId('c'),
  type,
  operand,
  ...(Object.keys(params).length ? { params } : {}),
});

export const coil = (
  type: CoilType,
  operand = '',
  params: Record<string, string> = { ...spec(type).defaults },
): Coil => ({
  kind: 'coil',
  id: newId('o'),
  type,
  operand,
  ...(Object.keys(params).length ? { params } : {}),
});

export const series = (items: LogicNode[] = []): Series => ({ id: newId('s'), items });

export const parallel = (...branches: Series[]): Parallel => ({
  kind: 'parallel',
  id: newId('p'),
  branches,
});

export const rung = (logic: LogicNode[] = [], coils: Coil[] = [], comment = ''): Rung => ({
  id: newId('r'),
  comment,
  logic: series(logic),
  coils,
});

export const emptyProgram = (): LadderProgram => ({ rungs: [rung()] });

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export interface Located {
  rung: Rung;
  rungIndex: number;
  /** The series that directly contains the node (undefined for coils). */
  series?: Series;
  index: number;
  node: LogicNode | Coil;
}

/** Visits every series in a rung (the logic and every branch, depth-first). */
export function forEachSeries(s: Series, visit: (s: Series) => void): void {
  visit(s);
  for (const item of s.items) {
    if (item.kind === 'parallel') item.branches.forEach((b) => forEachSeries(b, visit));
  }
}

export function locate(program: LadderProgram, id: string): Located | undefined {
  for (const [rungIndex, r] of program.rungs.entries()) {
    const coilIndex = r.coils.findIndex((c) => c.id === id);
    if (coilIndex >= 0) {
      return { rung: r, rungIndex, index: coilIndex, node: r.coils[coilIndex] as Coil };
    }
    let found: Located | undefined;
    forEachSeries(r.logic, (s) => {
      const index = s.items.findIndex((n) => n.id === id);
      if (!found && index >= 0) {
        found = { rung: r, rungIndex, series: s, index, node: s.items[index] as LogicNode };
      }
    });
    if (found) return found;
  }
  return undefined;
}

export function findSeries(program: LadderProgram, seriesId: string): Series | undefined {
  for (const r of program.rungs) {
    let found: Series | undefined;
    forEachSeries(r.logic, (s) => {
      if (s.id === seriesId) found = s;
    });
    if (found) return found;
  }
  return undefined;
}

/** Every contact and coil in program order. */
export function allElements(program: LadderProgram): Element[] {
  const out: Element[] = [];
  const walk = (s: Series) => {
    for (const item of s.items) {
      if (item.kind === 'contact') out.push(item);
      else item.branches.forEach(walk);
    }
  };
  for (const r of program.rungs) {
    walk(r.logic);
    out.push(...r.coils);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Immutable tree helpers
// ---------------------------------------------------------------------------------------------

/** Rebuilds a series, applying `fn` to the target series (by id) wherever it is. */
function mapSeries(s: Series, targetId: string, fn: (s: Series) => Series): Series {
  if (s.id === targetId) return fn(s);
  let changed = false;
  const items = s.items.map((item) => {
    if (item.kind !== 'parallel') return item;
    const branches = item.branches.map((b) => mapSeries(b, targetId, fn));
    if (branches.every((b, i) => b === item.branches[i])) return item;
    changed = true;
    return { ...item, branches };
  });
  return changed ? { ...s, items } : s;
}

function mapProgramSeries(
  program: LadderProgram,
  seriesId: string,
  fn: (s: Series) => Series,
): LadderProgram {
  return { rungs: program.rungs.map((r) => ({ ...r, logic: mapSeries(r.logic, seriesId, fn) })) };
}

function mapRung(program: LadderProgram, rungId: string, fn: (r: Rung) => Rung): LadderProgram {
  return { rungs: program.rungs.map((r) => (r.id === rungId ? fn(r) : r)) };
}

/**
 * Cleans a series after a removal: drops branches that became empty because of the removal,
 * and dissolves parallels left with a single branch (its items are spliced into the parent).
 */
function normalize(s: Series, removedFrom: Set<string>): Series {
  const items: LogicNode[] = [];
  for (const item of s.items) {
    if (item.kind === 'contact') {
      items.push(item);
      continue;
    }
    const branches = item.branches
      .map((b) => normalize(b, removedFrom))
      .filter((b) => !(b.items.length === 0 && removedFrom.has(b.id)));
    if (branches.length >= 2) items.push({ ...item, branches });
    else if (branches.length === 1) items.push(...(branches[0] as Series).items);
  }
  return { ...s, items };
}

// ---------------------------------------------------------------------------------------------
// Rung operations
// ---------------------------------------------------------------------------------------------

/** Inserts an empty rung after `afterIndex` (or at the end). Returns the program and its id. */
export function addRung(
  program: LadderProgram,
  afterIndex = program.rungs.length - 1,
): { program: LadderProgram; rungId: string } {
  const r = rung();
  const rungs = [...program.rungs];
  rungs.splice(afterIndex + 1, 0, r);
  return { program: { rungs }, rungId: r.id };
}

/** Removes a rung. A program always keeps at least one (empty) rung. */
export function deleteRung(program: LadderProgram, rungId: string): LadderProgram {
  const rungs = program.rungs.filter((r) => r.id !== rungId);
  return { rungs: rungs.length > 0 ? rungs : [rung()] };
}

export function moveRung(program: LadderProgram, rungId: string, delta: -1 | 1): LadderProgram {
  const from = program.rungs.findIndex((r) => r.id === rungId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= program.rungs.length) return program;
  const rungs = [...program.rungs];
  const [moved] = rungs.splice(from, 1);
  rungs.splice(to, 0, moved as Rung);
  return { rungs };
}

export function setRungComment(
  program: LadderProgram,
  rungId: string,
  comment: string,
): LadderProgram {
  return mapRung(program, rungId, (r) => ({ ...r, comment }));
}

// ---------------------------------------------------------------------------------------------
// Element operations
// ---------------------------------------------------------------------------------------------

/** Where a dragged element can be dropped. */
export type InsertTarget =
  /** In series, at `index` of a series (the rung logic or a branch). Contacts only. */
  | { kind: 'series'; seriesId: string; index: number }
  /** In a new parallel branch around a node (or as a new branch of a parallel). Contacts only. */
  | { kind: 'branch'; nodeId: string }
  /** In the coil column of a rung, at `index`. Coils only. */
  | { kind: 'coil'; rungId: string; index: number };

export function canInsert(element: Element | LogicNode, target: InsertTarget): boolean {
  if (target.kind === 'coil') return element.kind === 'coil';
  return element.kind === 'contact' || (element.kind === 'parallel' && target.kind === 'series');
}

/** Inserts an element (or a whole parallel block when moving) at a target. */
export function insertAt(
  program: LadderProgram,
  target: InsertTarget,
  element: Element | Parallel,
): LadderProgram {
  if (!canInsert(element, target)) return program;

  if (target.kind === 'coil') {
    return mapRung(program, target.rungId, (r) => {
      const coils = [...r.coils];
      coils.splice(clamp(target.index, 0, coils.length), 0, element as Coil);
      return { ...r, coils };
    });
  }

  if (target.kind === 'series') {
    return mapProgramSeries(program, target.seriesId, (s) => {
      const items = [...s.items];
      items.splice(clamp(target.index, 0, items.length), 0, element as LogicNode);
      return { ...s, items };
    });
  }

  // Branch: wrap the target node in a parallel, or add a branch to an existing parallel.
  const where = locate(program, target.nodeId);
  if (!where?.series || where.node.kind === 'coil') return program;
  const node = where.node;
  const newBranch = series([element as LogicNode]);
  return mapProgramSeries(program, where.series.id, (s) => {
    const items = [...s.items];
    items[where.index] =
      node.kind === 'parallel'
        ? { ...node, branches: [...node.branches, newBranch] }
        : parallel(series([node]), newBranch);
    return { ...s, items };
  });
}

/**
 * Wraps items [from, to] of a series in a parallel block with a new empty branch below.
 * Used to create a branch around several elements at once.
 */
export function wrapInParallel(
  program: LadderProgram,
  seriesId: string,
  from: number,
  to: number,
): { program: LadderProgram; parallelId?: string } {
  let parallelId: string | undefined;
  const next = mapProgramSeries(program, seriesId, (s) => {
    const lo = Math.max(0, Math.min(from, to));
    const hi = Math.min(s.items.length - 1, Math.max(from, to));
    if (hi < lo) return s;
    const block = parallel(series(s.items.slice(lo, hi + 1)), series());
    parallelId = block.id;
    return { ...s, items: [...s.items.slice(0, lo), block, ...s.items.slice(hi + 1)] };
  });
  return parallelId ? { program: next, parallelId } : { program };
}

/** Removes a contact, coil or parallel block, cleaning up branches left empty by the removal. */
export function removeElement(program: LadderProgram, id: string): LadderProgram {
  const where = locate(program, id);
  if (!where) return program;

  if (where.node.kind === 'coil') {
    return mapRung(program, where.rung.id, (r) => ({
      ...r,
      coils: r.coils.filter((c) => c.id !== id),
    }));
  }

  const containerId = (where.series as Series).id;
  const removed = mapProgramSeries(program, containerId, (s) => ({
    ...s,
    items: s.items.filter((n) => n.id !== id),
  }));
  return {
    rungs: removed.rungs.map((r) =>
      r.id === where.rung.id ? { ...r, logic: normalize(r.logic, new Set([containerId])) } : r,
    ),
  };
}

/** Changes an element's operand or type (a contact stays a contact, a coil stays a coil). */
export function updateElement(
  program: LadderProgram,
  id: string,
  patch: { operand?: string; type?: ContactType | CoilType; params?: Record<string, string> },
): LadderProgram {
  const where = locate(program, id);
  if (!where || where.node.kind === 'parallel') return program;
  const node = where.node;

  if (node.kind === 'coil') {
    const type = patch.type && isCoilType(patch.type) ? patch.type : node.type;
    const updated: Coil = {
      ...node,
      type,
      operand: patch.operand ?? node.operand,
      ...mergeParams(node.params, patch.params),
    };
    return mapRung(program, where.rung.id, (r) => ({
      ...r,
      coils: r.coils.map((c) => (c.id === id ? updated : c)),
    }));
  }

  const type = patch.type && isContactType(patch.type) ? patch.type : node.type;
  const updated: Contact = {
    ...node,
    type,
    operand: patch.operand ?? node.operand,
    ...mergeParams(node.params, patch.params),
  };
  return mapProgramSeries(program, (where.series as Series).id, (s) => ({
    ...s,
    items: s.items.map((n) => (n.id === id ? updated : n)),
  }));
}

/**
 * Moves an existing element (or parallel block) to a new target.
 * Returns the program unchanged if the move is invalid (e.g. into its own branch).
 */
export function moveElement(
  program: LadderProgram,
  id: string,
  target: InsertTarget,
): LadderProgram {
  const where = locate(program, id);
  if (!where || !canInsert(where.node, target)) return program;
  if (target.kind === 'branch' && target.nodeId === id) return program;

  // Moving a parallel inside itself would detach it from the tree.
  if (where.node.kind === 'parallel' && target.kind === 'series') {
    let inside = false;
    where.node.branches.forEach((b) =>
      forEachSeries(b, (s) => {
        if (s.id === target.seriesId) inside = true;
      }),
    );
    if (inside) return program;
  }

  // Mark the destination with a placeholder BEFORE removing the original: removal can dissolve
  // branches and shift indexes, but the placeholder keeps its place among its neighbours.
  const placeholder: Element =
    where.node.kind === 'coil'
      ? { kind: 'coil', id: PLACEHOLDER_ID, type: 'coil', operand: '' }
      : { kind: 'contact', id: PLACEHOLDER_ID, type: 'NO', operand: '' };
  const marked = insertAt(program, target, placeholder);
  if (marked === program) return program;
  return replaceNode(removeElement(marked, id), PLACEHOLDER_ID, where.node);
}

const PLACEHOLDER_ID = '__placeholder__';

/** Replaces the node with `id` by `node` in place. */
function replaceNode(program: LadderProgram, id: string, node: LogicNode | Coil): LadderProgram {
  const where = locate(program, id);
  if (!where) return program;
  if (where.node.kind === 'coil') {
    return mapRung(program, where.rung.id, (r) => ({
      ...r,
      coils: r.coils.map((c) => (c.id === id ? (node as Coil) : c)),
    }));
  }
  return mapProgramSeries(program, (where.series as Series).id, (s) => ({
    ...s,
    items: s.items.map((n) => (n.id === id ? (node as LogicNode) : n)),
  }));
}

const CONTACT_TYPES: readonly string[] = LOGIC_TYPES;
const COIL_TYPES: readonly string[] = OUTPUT_TYPES;

function mergeParams(
  current: Record<string, string> | undefined,
  patch: Record<string, string> | undefined,
): { params?: Record<string, string> } {
  const params = { ...current, ...patch };
  return Object.keys(params).length ? { params } : {};
}
export const isContactType = (t: string): t is ContactType => CONTACT_TYPES.includes(t);
export const isCoilType = (t: string): t is CoilType => COIL_TYPES.includes(t);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
