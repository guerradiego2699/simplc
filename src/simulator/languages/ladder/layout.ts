/**
 * Grid layout of a Ladder program (pure: no DOM).
 *
 * Units are grid cells: an element occupies one cell (1 × 1); wires run along row centres
 * (y = row + 0.5). The renderer multiplies by the cell size in pixels. Every wire and element
 * carries the probe id of the power it conducts, so the renderer can colour the power flow.
 */
import { RAIL } from './compile';
import type { Coil, InsertTarget, LadderProgram, Rung, Series } from './model';

/** Minimum logic width, so an empty rung still looks like a ladder. */
export const MIN_LOGIC_COLS = 4;

export interface PlacedElement {
  id: string;
  kind: 'contact' | 'coil';
  rungId: string;
  col: number;
  row: number;
  /** Probe ids of the power entering and leaving the element. */
  powerIn: string;
  powerOut: string;
}

export interface Wire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  power: string;
}

/** Vertical bar at the left of a parallel block — the handle to select/move/delete it. */
export interface ParallelHandle {
  id: string;
  x: number;
  y1: number;
  y2: number;
}

export interface DropZone {
  target: InsertTarget;
  accepts: 'contact' | 'coil';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RungLayout {
  rungId: string;
  rows: number;
  logicWidth: number;
  elements: PlacedElement[];
  wires: Wire[];
  parallels: ParallelHandle[];
  zones: DropZone[];
}

export interface ProgramLayout {
  /** Column where coils sit; the right rail is at x = coilCol + 1. */
  coilCol: number;
  cols: number;
  rungs: RungLayout[];
}

const ZONE = {
  seriesHalfWidth: 0.22,
  seriesTop: 0.2,
  seriesHeight: 0.6,
  branchTop: 0.78,
  branchHeight: 0.4,
};

interface Ctx {
  rung: Rung;
  elements: PlacedElement[];
  wires: Wire[];
  parallels: ParallelHandle[];
  zones: DropZone[];
}

interface Size {
  width: number;
  height: number;
  outRef: string;
}

function seriesZone(ctx: Ctx, s: Series, index: number, x: number, row: number): void {
  ctx.zones.push({
    target: { kind: 'series', seriesId: s.id, index },
    accepts: 'contact',
    x: x - ZONE.seriesHalfWidth,
    y: row + ZONE.seriesTop,
    w: ZONE.seriesHalfWidth * 2,
    h: ZONE.seriesHeight,
  });
}

function layoutSeries(ctx: Ctx, s: Series, col: number, row: number, inRef: string): Size {
  if (s.items.length === 0) {
    ctx.wires.push({ x1: col, y1: row + 0.5, x2: col + 1, y2: row + 0.5, power: inRef });
    // The whole empty slot is a target.
    ctx.zones.push({
      target: { kind: 'series', seriesId: s.id, index: 0 },
      accepts: 'contact',
      x: col + 0.1,
      y: row + ZONE.seriesTop,
      w: 0.8,
      h: ZONE.seriesHeight,
    });
    return { width: 1, height: 1, outRef: inRef };
  }

  let x = col;
  let height = 1;
  let ref = inRef;
  seriesZone(ctx, s, 0, x, row);

  s.items.forEach((item, i) => {
    if (item.kind === 'contact') {
      ctx.elements.push({
        id: item.id,
        kind: 'contact',
        rungId: ctx.rung.id,
        col: x,
        row,
        powerIn: ref,
        powerOut: item.id,
      });
      ctx.zones.push({
        target: { kind: 'branch', nodeId: item.id },
        accepts: 'contact',
        x: x + 0.1,
        y: row + ZONE.branchTop,
        w: 0.8,
        h: ZONE.branchHeight,
      });
      ref = item.id;
      x += 1;
    } else {
      const top = row;
      let branchRow = row;
      const sizes = item.branches.map((b) => {
        const size = layoutSeries(ctx, b, x, branchRow, ref);
        const placed = { ...size, row: branchRow };
        branchRow += size.height;
        return placed;
      });
      const width = Math.max(...sizes.map((b) => b.width));
      const lastRow = sizes[sizes.length - 1]?.row ?? top;
      // Pad short branches with wire up to the right edge of the block.
      for (const b of sizes) {
        if (b.width < width) {
          ctx.wires.push({
            x1: x + b.width,
            y1: b.row + 0.5,
            x2: x + width,
            y2: b.row + 0.5,
            power: b.outRef,
          });
        }
      }
      ctx.wires.push({ x1: x, y1: top + 0.5, x2: x, y2: lastRow + 0.5, power: ref });
      ctx.wires.push({
        x1: x + width,
        y1: top + 0.5,
        x2: x + width,
        y2: lastRow + 0.5,
        power: item.id,
      });
      ctx.parallels.push({ id: item.id, x, y1: top + 0.5, y2: lastRow + 0.5 });
      ctx.zones.push({
        target: { kind: 'branch', nodeId: item.id },
        accepts: 'contact',
        x: x + 0.1,
        y: branchRow - 1 + ZONE.branchTop,
        w: width - 0.2,
        h: ZONE.branchHeight,
      });
      height = Math.max(height, branchRow - row);
      ref = item.id;
      x += width;
    }
    seriesZone(ctx, s, i + 1, x, row);
  });

  return { width: x - col, height, outRef: ref };
}

function layoutRung(r: Rung, coilCol: number): RungLayout {
  const ctx: Ctx = { rung: r, elements: [], wires: [], parallels: [], zones: [] };
  const logic = layoutSeries(ctx, r.logic, 0, 0, RAIL);
  const out = logic.outRef;

  // Wire from the end of the logic to the coil column.
  if (logic.width < coilCol) {
    ctx.wires.push({ x1: logic.width, y1: 0.5, x2: coilCol, y2: 0.5, power: out });
  }

  r.coils.forEach((c: Coil, i) => {
    ctx.elements.push({
      id: c.id,
      kind: 'coil',
      rungId: r.id,
      col: coilCol,
      row: i,
      powerIn: out,
      powerOut: c.id,
    });
  });
  if (r.coils.length > 1) {
    ctx.wires.push({ x1: coilCol, y1: 0.5, x2: coilCol, y2: r.coils.length - 0.5, power: out });
  }

  // Coil drop zones: the empty slot, or between/around existing coils.
  if (r.coils.length === 0) {
    ctx.zones.push({
      target: { kind: 'coil', rungId: r.id, index: 0 },
      accepts: 'coil',
      x: coilCol + 0.1,
      y: 0.1,
      w: 0.8,
      h: 0.8,
    });
  } else {
    for (let i = 0; i <= r.coils.length; i++) {
      ctx.zones.push({
        target: { kind: 'coil', rungId: r.id, index: i },
        accepts: 'coil',
        x: coilCol + 0.1,
        y: i === 0 ? -0.05 : i - 0.2,
        w: 0.8,
        h: i === 0 ? 0.25 : 0.4,
      });
    }
  }

  return {
    rungId: r.id,
    rows: Math.max(logic.height, r.coils.length, 1),
    logicWidth: logic.width,
    elements: ctx.elements,
    wires: ctx.wires,
    parallels: ctx.parallels,
    zones: ctx.zones,
  };
}

/** Width of a rung's logic without placing anything (used to align all coils). */
function logicWidth(s: Series): number {
  if (s.items.length === 0) return 1;
  return s.items.reduce(
    (w, item) => w + (item.kind === 'contact' ? 1 : Math.max(...item.branches.map(logicWidth))),
    0,
  );
}

export function layoutProgram(program: LadderProgram): ProgramLayout {
  const widest = Math.max(MIN_LOGIC_COLS, ...program.rungs.map((r) => logicWidth(r.logic)));
  // One extra column of wire before the coils keeps them visually aligned at the right rail.
  const coilCol = widest + 1;
  return { coilCol, cols: coilCol + 1, rungs: program.rungs.map((r) => layoutRung(r, coilCol)) };
}
