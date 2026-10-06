/**
 * Function Block Diagram view of a Ladder rung (pure TypeScript).
 *
 * FBD and Ladder share the same program model (like LAD/FBD in many PLC tools): a rung is an
 * FBD network. This module turns the rung's series–parallel tree into a tree of blocks that
 * computes EXACTLY what the Ladder compiler computes:
 * - series → AND (&), parallel → OR (≥1), NO/NC contact → input (negated for NC),
 *   P/N edges and comparisons → small boxes, timers/counters → boxes whose logic input is
 *   everything to their left (Ladder "power flow").
 * - A parallel block whose branches are pure logic is factored: P AND (x OR y). If a branch
 *   contains a timer/counter, the incoming power must reach it, so the power is copied into
 *   each branch: (TON(IN := P AND x).Q) OR (P AND y).
 */
import { spec } from '@/simulator/languages/ladder/catalog';
import type { Coil, Contact, LogicNode, Rung, Series } from '@/simulator/languages/ladder/model';

export type FbdNode =
  /** NO/NC contact: a variable read (NC drawn with a negation circle). */
  | { kind: 'input'; element: Contact; seriesId: string; index: number }
  /** P/N edge or comparison: a box without logic input. */
  | { kind: 'leaf'; element: Contact; seriesId: string; index: number }
  /** Timer or counter: its logic input is `input` (TRUE when nothing is on its left). */
  | { kind: 'fb'; element: Contact; seriesId: string; index: number; input: FbdNode }
  /** AND (&) of the inputs. `seriesId` is the series new inputs are appended to. */
  | { kind: 'and'; seriesId: string; inputs: FbdNode[] }
  /** OR (≥1) of the inputs; a Ladder parallel block. */
  | { kind: 'or'; parallelId: string; inputs: FbdNode[] }
  /** Constant TRUE (the left rail; an empty branch). */
  | { kind: 'true' };

export interface FbdNetwork {
  rungId: string;
  /** The logic feeding the outputs (constant TRUE when the rung has no logic). */
  root: FbdNode;
  /** Id of the series that holds the rung logic (for inserting the first input). */
  logicId: string;
  outputs: Coil[];
}

const TRUE: FbdNode = { kind: 'true' };

const isBox = (c: Contact) => {
  const family = spec(c.type).family;
  return family === 'timer' || family === 'counter';
};

/** True when a branch contains no timer/counter (it can be factored out of the OR). */
function pure(items: readonly LogicNode[]): boolean {
  return items.every((n) =>
    n.kind === 'parallel' ? n.branches.every((b) => pure(b.items)) : !isBox(n),
  );
}

function andOf(inputs: FbdNode[], seriesId: string): FbdNode | null {
  if (inputs.length === 0) return null;
  if (inputs.length === 1) return inputs[0]!;
  return { kind: 'and', seriesId, inputs };
}

/** Builds the block tree of a series that receives `power` (null = straight from the rail). */
function seriesNode(s: Series, power: FbdNode | null): FbdNode | null {
  // Inputs of the AND being built. The incoming power comes first, flattened if it is an AND.
  let acc: FbdNode[] = power ? (power.kind === 'and' ? [...power.inputs] : [power]) : [];

  s.items.forEach((item, index) => {
    if (item.kind === 'parallel') {
      if (item.branches.every((b) => pure(b.items))) {
        const branches = item.branches.map((b) => seriesNode(b, null) ?? TRUE);
        acc.push({ kind: 'or', parallelId: item.id, inputs: branches });
      } else {
        const current = andOf(acc, s.id);
        const branches = item.branches.map((b) => seriesNode(b, current) ?? current ?? TRUE);
        acc = [{ kind: 'or', parallelId: item.id, inputs: branches }];
      }
      return;
    }
    const family = spec(item.type).family;
    if (family === 'contact' && (item.type === 'NO' || item.type === 'NC')) {
      acc.push({ kind: 'input', element: item, seriesId: s.id, index });
    } else if (family === 'timer' || family === 'counter') {
      acc = [{ kind: 'fb', element: item, seriesId: s.id, index, input: andOf(acc, s.id) ?? TRUE }];
    } else {
      acc.push({ kind: 'leaf', element: item, seriesId: s.id, index });
    }
  });

  return andOf(acc, s.id);
}

export function fbdNetwork(rung: Rung): FbdNetwork {
  return {
    rungId: rung.id,
    root: seriesNode(rung.logic, null) ?? TRUE,
    logicId: rung.logic.id,
    outputs: rung.coils,
  };
}

/**
 * Value of a node in RUN, from the probes the Ladder compiler records: `<id>:state` is the value
 * an element contributes (NC already inverted, edge pulse, comparison result, timer/counter Q).
 */
export function nodeValue(node: FbdNode, probes: Record<string, unknown>): boolean {
  switch (node.kind) {
    case 'true':
      return true;
    case 'input':
    case 'leaf':
    case 'fb':
      return probes[`${node.element.id}:state`] === true;
    case 'and':
      return node.inputs.every((n) => nodeValue(n, probes));
    case 'or':
      return node.inputs.some((n) => nodeValue(n, probes));
  }
}
