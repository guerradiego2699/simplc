/**
 * Read-only drawing of a Ladder program for content pages (server-rendered, no store, no
 * interaction). Same symbols and grid as the editor; wires are drawn "off" (no power flow).
 */
import type { Tag } from '@/simulator/project/types';
import { spec } from '../catalog';
import { layoutProgram } from '../layout';
import type { Element, LadderProgram } from '../model';
import { CELL_H, CELL_W, displayOperand } from './ElementView';
import { BoxShape, CoilShape, CompareShape, ContactShape } from './symbols';

const MARGIN_LEFT = 24;
const RIGHT_PAD = 24;
const PAD_Y = 8;
const OFF = { left: 'var(--wire-off)', right: 'var(--wire-off)', body: 'var(--text)' };
const MATH_SIGN: Record<string, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷' };

const clip = (s: string, max = 12) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

interface Props {
  program: LadderProgram;
  tags: readonly Tag[];
  /** Heading of each rung, e.g. "Rung 1". */
  rungLabel: (n: number) => string;
}

export function StaticLadder({ program, tags, rungLabel }: Props) {
  const layout = layoutProgram(program);
  const width = MARGIN_LEFT + layout.cols * CELL_W + RIGHT_PAD;
  const rightRailX = MARGIN_LEFT + layout.cols * CELL_W;
  const elements = new Map<string, Element>();
  const collect = (items: LadderProgram['rungs'][number]['logic']['items']): void => {
    for (const item of items) {
      if (item.kind === 'parallel') item.branches.forEach((b) => collect(b.items));
      else elements.set(item.id, item);
    }
  };
  program.rungs.forEach((r) => {
    collect(r.logic.items);
    r.coils.forEach((c) => elements.set(c.id, c));
  });

  return (
    <ol className="flex flex-col gap-5">
      {layout.rungs.map((rl, i) => {
        const rung = program.rungs[i];
        if (!rung) return null;
        const height = rl.rows * CELL_H + PAD_Y * 2;
        const X = (cx: number) => MARGIN_LEFT + cx * CELL_W;
        const Y = (cy: number) => PAD_Y + cy * CELL_H;
        return (
          <li key={rung.id}>
            <p className="mb-1 text-sm">
              <span className="font-mono font-semibold text-text-muted">{rungLabel(i + 1)}</span>
              {rung.comment && <span className="text-text"> — {rung.comment}</span>}
            </p>
            <div className="overflow-x-auto rounded-md border border-border bg-bg">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                className="block max-w-none"
                role="img"
                aria-label={`${rungLabel(i + 1)}${rung.comment ? `: ${rung.comment}` : ''}`}
              >
                <line
                  x1={MARGIN_LEFT}
                  y1={PAD_Y}
                  x2={MARGIN_LEFT}
                  y2={height - PAD_Y}
                  stroke="var(--wire-off)"
                  strokeWidth={4}
                />
                <line
                  x1={rightRailX}
                  y1={PAD_Y}
                  x2={rightRailX}
                  y2={height - PAD_Y}
                  stroke="var(--wire-off)"
                  strokeWidth={4}
                />
                {rl.wires.map((w, k) => (
                  <line
                    key={k}
                    x1={X(w.x1)}
                    y1={Y(w.y1)}
                    x2={X(w.x2)}
                    y2={Y(w.y2)}
                    stroke="var(--wire-off)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                  />
                ))}
                {rl.elements.map((pe) => {
                  const el = elements.get(pe.id);
                  return el ? (
                    <StaticElement
                      key={pe.id}
                      element={el}
                      x={X(pe.col)}
                      y={Y(pe.row)}
                      tags={tags}
                    />
                  ) : null;
                })}
              </svg>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StaticElement({
  element,
  x,
  y,
  tags,
}: {
  element: Element;
  x: number;
  y: number;
  tags: readonly Tag[];
}) {
  const info = spec(element.type);
  const show = (key: string) =>
    displayOperand(
      key === 'operand' ? element.operand : (element.params?.[key] ?? ''),
      tags,
      'generic',
      '?',
    );
  const main = show('operand');
  let top = main.label;
  let bottom = main.sub;
  switch (info.family) {
    case 'compare':
      bottom = show('in2').label;
      break;
    case 'timer':
      bottom = `PT ${show('pt').label}`;
      break;
    case 'counter':
      bottom = `PV ${show('pv').label}`;
      break;
    case 'box': {
      top = `→ ${main.label}`;
      const sign = MATH_SIGN[element.type];
      bottom = sign ? `${show('in1').label} ${sign} ${show('in2').label}` : show('in').label;
      break;
    }
  }
  const small = info.family === 'contact' || info.family === 'coil' || info.family === 'compare';
  return (
    <g transform={`translate(${x} ${y})`} data-type={element.type}>
      {info.family === 'contact' && (
        <ContactShape type={element.type as never} w={CELL_W} h={CELL_H} colors={OFF} />
      )}
      {info.family === 'coil' && (
        <CoilShape type={element.type as never} w={CELL_W} h={CELL_H} colors={OFF} />
      )}
      {info.family === 'compare' && (
        <CompareShape symbol={info.symbol} w={CELL_W} h={CELL_H} colors={OFF} />
      )}
      {(info.family === 'timer' || info.family === 'counter' || info.family === 'box') && (
        <BoxShape symbol={info.symbol} w={CELL_W} h={CELL_H} colors={OFF} />
      )}
      <text
        x={CELL_W / 2}
        y={CELL_H / 2 - (small ? 21 : 24)}
        textAnchor="middle"
        fontFamily="var(--ff-mono)"
        fontSize={12}
        fontWeight={600}
        fill="var(--text)"
      >
        {clip(top)}
      </text>
      {bottom && (
        <text
          x={CELL_W / 2}
          y={CELL_H / 2 + 31}
          textAnchor="middle"
          fontFamily="var(--ff-mono)"
          fontSize={10.5}
          fill="var(--text-muted)"
        >
          {clip(bottom, info.family === 'box' ? 14 : 12)}
        </text>
      )}
    </g>
  );
}
