import { describe, expect, it } from 'vitest';
import { PlcRuntime } from '@/simulator/engine';
import { EXAMPLES, exampleProject } from '@/simulator/examples';
import { compileLadder } from '@/simulator/languages/ladder/compile';
import {
  coil,
  contact,
  parallel,
  rung,
  series,
  type LadderProgram,
  type Rung,
} from '@/simulator/languages/ladder/model';
import type { Tag } from '@/simulator/project/types';
import { randomProgram, rng } from '../../__tests__/random-ladder';
import { fbdNetwork, nodeValue, type FbdNode } from '../tree';

/** Compact text form of a block tree, for readable assertions. */
function show(n: FbdNode): string {
  switch (n.kind) {
    case 'true':
      return '1';
    case 'input':
      return (n.element.type === 'NC' ? '/' : '') + n.element.operand;
    case 'leaf':
      return `${n.element.type}(${n.element.operand})`;
    case 'fb':
      return `${n.element.type}[${show(n.input)}]`;
    case 'and':
      return `&(${n.inputs.map(show).join(',')})`;
    case 'or':
      return `≥1(${n.inputs.map(show).join(',')})`;
  }
}

const tree = (r: Rung) => show(fbdNetwork(r).root);

describe('FBD block tree', () => {
  it('series → AND, parallel → OR, NC → negated input', () => {
    expect(
      tree(
        rung(
          [
            parallel(series([contact('NO', 'A')]), series([contact('NO', 'M')])),
            contact('NC', 'B'),
          ],
          [coil('coil', 'M')],
        ),
      ),
    ).toBe('&(≥1(A,M),/B)');
    expect(tree(rung([contact('NO', 'A')], [coil('coil', 'Q')]))).toBe('A');
    expect(tree(rung([], [coil('coil', 'Q')]))).toBe('1');
  });

  it('a timer takes everything on its left as input; edges and comparisons are boxes', () => {
    expect(
      tree(
        rung(
          [
            contact('NO', 'A'),
            contact('P', 'B'),
            contact('TON', 'T0', { pt: 'T#1s' }),
            contact('GT', 'MW0', { in2: '5' }),
          ],
          [coil('coil', 'Q')],
        ),
      ),
    ).toBe('&(TON[&(A,P(B))],GT(MW0))');
  });

  it('a timer inside a branch receives the power from before the parallel', () => {
    expect(
      tree(
        rung(
          [
            contact('NO', 'P'),
            parallel(
              series([contact('NO', 'X'), contact('TON', 'T0', { pt: 'T#1s' })]),
              series([contact('NO', 'Y')]),
              series([]),
            ),
          ],
          [coil('coil', 'Q')],
        ),
      ),
    ).toBe('≥1(TON[&(P,X)],&(P,Y),P)');
  });

  it('every example and 300 random programs show exactly the Ladder rung result', () => {
    const programs: { program: LadderProgram; tags: readonly Tag[] }[] = [
      ...EXAMPLES.map((e) => {
        const p = exampleProject(e, 'es');
        return { program: p.ladder, tags: p.tags };
      }),
    ];
    const random = rng(7);
    for (let k = 0; k < 300; k++) programs.push({ program: randomProgram(random), tags: [] });

    programs.forEach(({ program, tags }, k) => {
      const { ir } = compileLadder(program, tags);
      const rt = new PlcRuntime({ trace: true });
      rt.load(ir!);
      rt.start();
      const networks = program.rungs.map(fbdNetwork);
      const input = rng(k + 1);
      for (let scan = 0; scan < 150; scan++) {
        if (input() < 0.3) rt.setInput(`I0.${Math.floor(input() * 8)}`, input() < 0.5);
        rt.scan();
        const probes = Object.fromEntries(rt.probes);
        program.rungs.forEach((r, i) => {
          // The rung result in Ladder: power after the last logic item (the rail if empty).
          const last = r.logic.items.at(-1);
          const expected = last ? probes[last.id] === true : true;
          const got = nodeValue(networks[i]!.root, probes);
          if (got !== expected) {
            expect({ program: k, rung: i, scan, tree: show(networks[i]!.root), got }).toEqual({
              program: k,
              rung: i,
              scan,
              tree: show(networks[i]!.root),
              got: expected,
            });
          }
        });
      }
    });
  });
});
