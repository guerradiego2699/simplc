import { describe, expect, it } from 'vitest';
import {
  addRung,
  allElements,
  coil,
  contact,
  deleteRung,
  insertAt,
  locate,
  moveElement,
  moveRung,
  parallel,
  removeElement,
  rung,
  series,
  setRungComment,
  updateElement,
  wrapInParallel,
  type LadderProgram,
  type Parallel,
} from '../model';

/** Compact textual form of a series: "A B (C | D)" — for readable assertions. */
function show(program: LadderProgram, rungIndex = 0): string {
  const r = program.rungs[rungIndex];
  if (!r) return '<none>';
  const s = (items: typeof r.logic.items): string =>
    items
      .map((n) =>
        n.kind === 'contact'
          ? n.operand
          : `(${n.branches.map((b) => (b.items.length ? s(b.items) : '_')).join(' | ')})`,
      )
      .join(' ');
  return `${s(r.logic.items)} -> ${r.coils.map((c) => c.operand).join(',')}`;
}

function sample() {
  const a = contact('NO', 'A');
  const b = contact('NC', 'B');
  const q = coil('coil', 'Q');
  const program: LadderProgram = { rungs: [rung([a, b], [q])] };
  return { program, a, b, q };
}

describe('queries', () => {
  it('locates contacts and coils with their container', () => {
    const { program, b, q } = sample();
    expect(locate(program, b.id)).toMatchObject({ index: 1, rungIndex: 0, node: b });
    expect(locate(program, q.id)).toMatchObject({ index: 0, node: q });
    expect(locate(program, 'nope')).toBeUndefined();
  });

  it('lists every element in program order', () => {
    const c = contact('NO', 'C');
    const p = {
      rungs: [rung([parallel(series([contact('NO', 'A')]), series([c]))], [coil('coil', 'Q')])],
    };
    expect(allElements(p).map((e) => e.operand)).toEqual(['A', 'C', 'Q']);
  });
});

describe('rungs', () => {
  it('adds, comments, moves and deletes rungs', () => {
    let { program } = sample();
    const added = addRung(program);
    program = setRungComment(added.program, added.rungId, 'second');
    expect(program.rungs.map((r) => r.comment)).toEqual(['', 'second']);
    program = moveRung(program, added.rungId, -1);
    expect(program.rungs[0]?.comment).toBe('second');
    expect(moveRung(program, added.rungId, -1)).toBe(program); // already first
    program = deleteRung(program, added.rungId);
    expect(program.rungs).toHaveLength(1);
  });

  it('always keeps at least one rung', () => {
    const { program } = sample();
    const after = deleteRung(program, program.rungs[0]?.id ?? '');
    expect(after.rungs).toHaveLength(1);
    expect(after.rungs[0]?.logic.items).toEqual([]);
  });

  it('can insert a rung in the middle', () => {
    const { program } = sample();
    const { program: two } = addRung(program);
    const { program: three, rungId } = addRung(two, 0);
    expect(three.rungs[1]?.id).toBe(rungId);
  });
});

describe('insert', () => {
  it('inserts contacts in series at any position', () => {
    const { program } = sample();
    const seriesId = program.rungs[0]?.logic.id ?? '';
    const first = insertAt(program, { kind: 'series', seriesId, index: 0 }, contact('NO', 'X'));
    expect(show(first)).toBe('X A B -> Q');
    const last = insertAt(program, { kind: 'series', seriesId, index: 99 }, contact('NO', 'Y'));
    expect(show(last)).toBe('A B Y -> Q');
  });

  it('creates a parallel branch around a contact', () => {
    const { program, a } = sample();
    const next = insertAt(program, { kind: 'branch', nodeId: a.id }, contact('NO', 'M'));
    expect(show(next)).toBe('(A | M) B -> Q');
  });

  it('adds a branch to an existing parallel block', () => {
    const { program, a } = sample();
    const withBranch = insertAt(program, { kind: 'branch', nodeId: a.id }, contact('NO', 'M'));
    const par = withBranch.rungs[0]?.logic.items[0] as Parallel;
    const three = insertAt(withBranch, { kind: 'branch', nodeId: par.id }, contact('NO', 'N'));
    expect(show(three)).toBe('(A | M | N) B -> Q');
  });

  it('inserts contacts inside a branch', () => {
    const { program, a } = sample();
    const withBranch = insertAt(program, { kind: 'branch', nodeId: a.id }, contact('NO', 'M'));
    const par = withBranch.rungs[0]?.logic.items[0] as Parallel;
    const lower = par.branches[1]?.id ?? '';
    const next = insertAt(
      withBranch,
      { kind: 'series', seriesId: lower, index: 1 },
      contact('NC', 'K'),
    );
    expect(show(next)).toBe('(A | M K) B -> Q');
  });

  it('inserts parallel coils', () => {
    const { program } = sample();
    const rungId = program.rungs[0]?.id ?? '';
    const next = insertAt(program, { kind: 'coil', rungId, index: 1 }, coil('set', 'R'));
    expect(show(next)).toBe('A B -> Q,R');
  });

  it('rejects coils in the logic and contacts in the coil column', () => {
    const { program } = sample();
    const seriesId = program.rungs[0]?.logic.id ?? '';
    const rungId = program.rungs[0]?.id ?? '';
    expect(insertAt(program, { kind: 'series', seriesId, index: 0 }, coil('coil', 'Z'))).toBe(
      program,
    );
    expect(insertAt(program, { kind: 'coil', rungId, index: 0 }, contact('NO', 'Z'))).toBe(program);
  });

  it('does not mutate the original program', () => {
    const { program } = sample();
    const before = JSON.stringify(program);
    insertAt(
      program,
      { kind: 'series', seriesId: program.rungs[0]?.logic.id ?? '', index: 0 },
      contact('NO', 'X'),
    );
    expect(JSON.stringify(program)).toBe(before);
  });
});

describe('wrap in parallel', () => {
  it('wraps a range of contacts with an empty branch below', () => {
    const { program } = sample();
    const { program: next, parallelId } = wrapInParallel(
      program,
      program.rungs[0]?.logic.id ?? '',
      0,
      1,
    );
    expect(parallelId).toBeDefined();
    expect(show(next)).toBe('(A B | _) -> Q');
  });
});

describe('remove', () => {
  it('removes contacts and coils', () => {
    const { program, a, q } = sample();
    expect(show(removeElement(program, a.id))).toBe('B -> Q');
    expect(show(removeElement(program, q.id))).toBe('A B -> ');
  });

  it('removing the only contact of a branch removes the branch and dissolves the block', () => {
    const { program, a } = sample();
    const m = contact('NO', 'M');
    const withBranch = insertAt(program, { kind: 'branch', nodeId: a.id }, m);
    expect(show(removeElement(withBranch, m.id))).toBe('A B -> Q');
    expect(show(removeElement(withBranch, a.id))).toBe('M B -> Q');
  });

  it('keeps a branch that still has elements', () => {
    const { program, a } = sample();
    const m = contact('NO', 'M');
    let p = insertAt(program, { kind: 'branch', nodeId: a.id }, m);
    const par = p.rungs[0]?.logic.items[0] as Parallel;
    p = insertAt(
      p,
      { kind: 'series', seriesId: par.branches[1]?.id ?? '', index: 1 },
      contact('NO', 'K'),
    );
    expect(show(removeElement(p, m.id))).toBe('(A | K) B -> Q');
  });

  it('keeps deliberately empty branches when removing elsewhere', () => {
    const { program, b } = sample();
    const { program: wrapped } = wrapInParallel(program, program.rungs[0]?.logic.id ?? '', 0, 0);
    expect(show(removeElement(wrapped, b.id))).toBe('(A | _) -> Q');
  });

  it('removes a whole parallel block', () => {
    const { program, a } = sample();
    const p = insertAt(program, { kind: 'branch', nodeId: a.id }, contact('NO', 'M'));
    const par = p.rungs[0]?.logic.items[0] as Parallel;
    expect(show(removeElement(p, par.id))).toBe('B -> Q');
  });
});

describe('update', () => {
  it('changes operand and type, keeping contacts as contacts and coils as coils', () => {
    const { program, a, q } = sample();
    let p = updateElement(program, a.id, { operand: 'I0.5', type: 'P' });
    expect(locate(p, a.id)?.node).toMatchObject({ operand: 'I0.5', type: 'P' });
    p = updateElement(p, a.id, { type: 'set' }); // not a contact type: ignored
    expect(locate(p, a.id)?.node).toMatchObject({ type: 'P' });
    p = updateElement(p, q.id, { type: 'reset' });
    expect(locate(p, q.id)?.node).toMatchObject({ type: 'reset' });
  });
});

describe('move', () => {
  it('moves a contact to another position in the same series', () => {
    const { program, a } = sample();
    const seriesId = program.rungs[0]?.logic.id ?? '';
    expect(show(moveElement(program, a.id, { kind: 'series', seriesId, index: 2 }))).toBe(
      'B A -> Q',
    );
  });

  it('moves a contact into a branch around another contact', () => {
    const { program, a, b } = sample();
    expect(show(moveElement(program, b.id, { kind: 'branch', nodeId: a.id }))).toBe('(A | B) -> Q');
  });

  it('moves a contact out of a branch, dissolving it, to a later position', () => {
    const { program, a, b } = sample();
    const m = contact('NO', 'M');
    const p = insertAt(program, { kind: 'branch', nodeId: a.id }, m);
    const seriesId = p.rungs[0]?.logic.id ?? '';
    // Series is [(A|M), B]; move M to the end (index 2). Removing M dissolves the block.
    expect(show(moveElement(p, m.id, { kind: 'series', seriesId, index: 2 }))).toBe('A B M -> Q');
    expect(b).toBeDefined();
  });

  it('moves coils between rungs', () => {
    const { program, q } = sample();
    const { program: two, rungId } = addRung(program);
    const moved = moveElement(two, q.id, { kind: 'coil', rungId, index: 0 });
    expect(show(moved, 0)).toBe('A B -> ');
    expect(show(moved, 1)).toBe(' -> Q');
  });

  it('refuses invalid moves', () => {
    const { program, a, q } = sample();
    const seriesId = program.rungs[0]?.logic.id ?? '';
    expect(moveElement(program, a.id, { kind: 'branch', nodeId: a.id })).toBe(program);
    expect(moveElement(program, q.id, { kind: 'series', seriesId, index: 0 })).toBe(program);
    const p = insertAt(program, { kind: 'branch', nodeId: a.id }, contact('NO', 'M'));
    const par = p.rungs[0]?.logic.items[0] as Parallel;
    // A block cannot be moved inside one of its own branches.
    expect(
      moveElement(p, par.id, { kind: 'series', seriesId: par.branches[0]?.id ?? '', index: 0 }),
    ).toBe(p);
  });
});
