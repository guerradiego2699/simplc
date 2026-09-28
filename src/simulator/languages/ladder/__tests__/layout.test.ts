import { describe, expect, it } from 'vitest';
import { RAIL } from '../compile';
import { layoutProgram, MIN_LOGIC_COLS } from '../layout';
import { coil, contact, parallel, rung, series, type LadderProgram } from '../model';

describe('layoutProgram', () => {
  it('places series contacts left to right and coils at the right column', () => {
    const a = contact('NO', 'A');
    const b = contact('NO', 'B');
    const q = coil('coil', 'Q');
    const layout = layoutProgram({ rungs: [rung([a, b], [q])] });
    const r = layout.rungs[0]!;
    expect(layout.coilCol).toBe(MIN_LOGIC_COLS + 1);
    expect(r.elements.map((e) => [e.id, e.col, e.row])).toEqual([
      [a.id, 0, 0],
      [b.id, 1, 0],
      [q.id, layout.coilCol, 0],
    ]);
    // Power chain: rail → A → B → coil.
    expect(r.elements.map((e) => [e.powerIn, e.powerOut])).toEqual([
      [RAIL, a.id],
      [a.id, b.id],
      [b.id, q.id],
    ]);
    // Wire from the end of the logic to the coil column carries B's output.
    expect(r.wires).toContainEqual({ x1: 2, y1: 0.5, x2: layout.coilCol, y2: 0.5, power: b.id });
  });

  it('stacks parallel branches and pads the short one with wire', () => {
    const a = contact('NO', 'A');
    const x = contact('NO', 'X');
    const y = contact('NO', 'Y');
    const par = parallel(series([a]), series([x, y]));
    const layout = layoutProgram({ rungs: [rung([par], [coil('coil', 'Q')])] });
    const r = layout.rungs[0]!;
    expect(r.rows).toBe(2);
    expect(r.elements.find((e) => e.id === a.id)).toMatchObject({ col: 0, row: 0 });
    expect(r.elements.find((e) => e.id === y.id)).toMatchObject({ col: 1, row: 1 });
    expect(r.wires).toContainEqual({ x1: 1, y1: 0.5, x2: 2, y2: 0.5, power: a.id }); // padding
    expect(r.wires).toContainEqual({ x1: 0, y1: 0.5, x2: 0, y2: 1.5, power: RAIL }); // left join
    expect(r.wires).toContainEqual({ x1: 2, y1: 0.5, x2: 2, y2: 1.5, power: par.id }); // right join
    expect(r.parallels).toEqual([{ id: par.id, x: 0, y1: 0.5, y2: 1.5 }]);
  });

  it('aligns coils of all rungs to the widest logic', () => {
    const wide = Array.from({ length: 7 }, (_, i) => contact('NO', `C${i}`));
    const layout = layoutProgram({
      rungs: [rung(wide, [coil('coil', 'Q1')]), rung([contact('NO', 'A')], [coil('coil', 'Q2')])],
    });
    expect(layout.coilCol).toBe(8);
    expect(layout.rungs[1]!.elements.find((e) => e.kind === 'coil')).toMatchObject({ col: 8 });
  });

  it('stacks parallel coils and joins them with a vertical bus', () => {
    const layout = layoutProgram({
      rungs: [rung([contact('NO', 'A')], [coil('coil', 'Q1'), coil('coil', 'Q2')])],
    });
    const r = layout.rungs[0]!;
    expect(r.rows).toBe(2);
    expect(r.elements.filter((e) => e.kind === 'coil').map((e) => e.row)).toEqual([0, 1]);
  });

  it('offers drop zones: series gaps, branches and coil slots', () => {
    const a = contact('NO', 'A');
    const program: LadderProgram = { rungs: [rung([a], [])] };
    const r = layoutProgram(program).rungs[0]!;
    const targets = r.zones.map((z) => z.target);
    const seriesId = program.rungs[0]!.logic.id;
    expect(targets).toContainEqual({ kind: 'series', seriesId, index: 0 });
    expect(targets).toContainEqual({ kind: 'series', seriesId, index: 1 });
    expect(targets).toContainEqual({ kind: 'branch', nodeId: a.id });
    expect(targets).toContainEqual({ kind: 'coil', rungId: program.rungs[0]!.id, index: 0 });
    expect(r.zones.filter((z) => z.accepts === 'coil')).toHaveLength(1);
  });

  it('an empty rung is a one-row wire with one contact slot and one coil slot', () => {
    const r = layoutProgram({ rungs: [rung()] }).rungs[0]!;
    expect(r.rows).toBe(1);
    expect(r.elements).toEqual([]);
    expect(r.zones.map((z) => z.accepts).sort()).toEqual(['coil', 'contact']);
  });
});
