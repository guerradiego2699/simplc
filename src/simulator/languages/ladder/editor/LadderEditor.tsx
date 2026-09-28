import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveOperand } from '@/simulator/project/tags';
import type { Tag } from '@/simulator/project/types';
import { acceptsOf, startDragOrClick } from '@/simulator/ui/drag';
import { diagnosticMessage, indexDiagnostics, worst } from '@/simulator/ui/diagnostics';
import { fmt, useSim, useStoreApi, useStrings } from '@/simulator/ui/context';
import { RAIL, stateProbe, type LadderDiagnostic } from '../compile';
import { layoutProgram, type PlacedElement } from '../layout';
import { allElements, locate, type Element } from '../model';
import { CoilShape, ContactShape } from './symbols';

/** Geometry in px at zoom 1. */
export const CELL_W = 96;
export const CELL_H = 76;
const MARGIN_LEFT = 64;
const HEADER_H = 30;
const RUNG_PAD = 22;
const RIGHT_PAD = 28;

const clip = (s: string, max = 12) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function LadderEditor() {
  const t = useStrings();
  const store = useStoreApi();
  const { ladder, tags, diagnostics, selection, drag, status, probes, zoom, forced } = useSim(
    useShallow((s) => ({
      ladder: s.project.ladder,
      tags: s.project.tags,
      diagnostics: s.compiled.diagnostics,
      selection: s.selection,
      drag: s.drag,
      status: s.status,
      probes: s.probes,
      zoom: s.zoom,
      forced: s.snapshot?.forced,
    })),
  );

  const layout = useMemo(() => layoutProgram(ladder), [ladder]);
  const elements = useMemo(() => new Map(allElements(ladder).map((e) => [e.id, e])), [ladder]);
  const diag = useMemo(() => indexDiagnostics(diagnostics), [diagnostics]);
  const running = status !== 'stopped';

  const power = (ref: string) => running && (ref === RAIL || probes[ref] === true);
  const wireColor = (ref: string) => (power(ref) ? 'var(--wire-on)' : 'var(--wire-off)');

  const selectedIds = new Set(
    selection?.kind === 'element'
      ? [selection.id]
      : selection?.kind === 'range'
        ? selection.ids
        : [],
  );

  // Ctrl + wheel zoom (needs a non-passive listener to prevent page zoom).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const s = store.getState();
      s.setZoom(s.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store]);

  /** Click on an element: select it, or extend a range with Shift. */
  const clickElement = (id: string, shift: boolean) => {
    const s = store.getState();
    const anchor =
      s.selection?.kind === 'element'
        ? s.selection.id
        : s.selection?.kind === 'range'
          ? s.selection.ids[0]
          : undefined;
    if (shift && anchor && anchor !== id) {
      const a = locate(s.project.ladder, anchor);
      const b = locate(s.project.ladder, id);
      if (a?.series && b?.series && a.series.id === b.series.id) {
        const lo = Math.min(a.index, b.index);
        const hi = Math.max(a.index, b.index);
        const ids = a.series.items.slice(lo, hi + 1).map((n) => n.id);
        s.select({
          kind: 'range',
          seriesId: a.series.id,
          ids: [anchor, ...ids.filter((x) => x !== anchor)],
        });
        return;
      }
    }
    s.select({ kind: 'element', id });
  };

  const rungHeights = layout.rungs.map((r) => HEADER_H + r.rows * CELL_H + RUNG_PAD);
  const width = MARGIN_LEFT + layout.cols * CELL_W + RIGHT_PAD;
  const height = rungHeights.reduce((a, b) => a + b, 0) + 8;
  const rightRailX = MARGIN_LEFT + layout.cols * CELL_W;
  const dragAccepts = drag ? acceptsOf(drag.item) : null;
  const rungTops = rungHeights.map((_, i) => rungHeights.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <div
      ref={scroller}
      className="relative h-full overflow-auto bg-bg"
      style={{
        // CAD grid over the whole panel; scrolls with the drawing and follows the zoom.
        backgroundImage:
          'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)',
        backgroundSize: `${(CELL_W / 2) * zoom}px ${(CELL_H / 2) * zoom}px`,
        backgroundAttachment: 'local',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) store.getState().select(null);
      }}
    >
      <svg
        width={width * zoom}
        height={height * zoom}
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        aria-label={t.editor.label}
        className="block select-none"
        onPointerDown={(e) => {
          if (e.target instanceof SVGElement && e.target.dataset['background'] !== undefined) {
            store.getState().select(null);
          }
        }}
      >
        <rect data-background width={width} height={height} fill="transparent" />

        {layout.rungs.map((rl, rungIndex) => {
          const rung = ladder.rungs[rungIndex];
          if (!rung) return null;
          const top = rungTops[rungIndex] ?? 0;
          const oy = top + HEADER_H;
          const bodyH = rl.rows * CELL_H;
          const rungSelected = selection?.kind === 'rung' && selection.id === rung.id;
          const rungWorst = worst(diag.byRung.get(rung.id));
          const X = (cx: number) => MARGIN_LEFT + cx * CELL_W;
          const Y = (cy: number) => oy + cy * CELL_H;

          return (
            <g key={rung.id} data-rung={rung.id}>
              {/* Header: number + comment (click to select the rung) */}
              <g
                role="button"
                tabIndex={0}
                aria-label={`${fmt(t.editor.rung, { n: rungIndex + 1 })}. ${rung.comment || t.editor.noComment}`}
                aria-pressed={rungSelected}
                className="cursor-pointer outline-none"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  store.getState().select({ kind: 'rung', id: rung.id });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    store.getState().select({ kind: 'rung', id: rung.id });
                  }
                }}
              >
                <rect
                  x={0}
                  y={top + 2}
                  width={width}
                  height={HEADER_H - 4}
                  fill={rungSelected ? 'var(--surface-2)' : 'transparent'}
                />
                {rungSelected && (
                  <rect x={0} y={top + 2} width={3} height={HEADER_H - 4} fill="var(--primary)" />
                )}
                <text
                  x={14}
                  y={top + 20}
                  fontFamily="var(--ff-mono)"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--text-muted)"
                >
                  {String(rungIndex + 1).padStart(3, '0')}
                </text>
                {rungWorst && (
                  <circle
                    cx={50}
                    cy={top + 16}
                    r={4}
                    fill={rungWorst === 'error' ? 'var(--danger)' : 'var(--warning)'}
                  />
                )}
                <text
                  x={MARGIN_LEFT}
                  y={top + 20}
                  fontSize={12.5}
                  fill={rung.comment ? 'var(--text)' : 'var(--text-muted)'}
                  fontStyle={rung.comment ? 'normal' : 'italic'}
                  opacity={rung.comment ? 1 : 0.7}
                >
                  {clip(rung.comment || t.editor.noComment, Math.floor((width - MARGIN_LEFT) / 7))}
                </text>
              </g>

              {/* Rails */}
              <line
                x1={MARGIN_LEFT}
                y1={oy}
                x2={MARGIN_LEFT}
                y2={oy + bodyH}
                stroke={wireColor(RAIL)}
                strokeWidth={4}
              />
              <line
                x1={rightRailX}
                y1={oy}
                x2={rightRailX}
                y2={oy + bodyH}
                stroke="var(--wire-off)"
                strokeWidth={4}
              />

              {/* Wires */}
              {rl.wires.map((w, i) => (
                <line
                  key={i}
                  x1={X(w.x1)}
                  y1={Y(w.y1)}
                  x2={X(w.x2)}
                  y2={Y(w.y2)}
                  stroke={wireColor(w.power)}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                />
              ))}

              {/* Parallel blocks: the left bar is a handle to select / move / delete the block */}
              {rl.parallels.map((p) => {
                const selected = selectedIds.has(p.id);
                return (
                  <line
                    key={p.id}
                    data-parallel={p.id}
                    x1={X(p.x)}
                    y1={Y(p.y1)}
                    x2={X(p.x)}
                    y2={Y(p.y2)}
                    stroke={selected ? 'var(--primary)' : 'transparent'}
                    strokeWidth={selected ? 4 : 14}
                    className="cursor-pointer"
                    style={{ pointerEvents: 'stroke' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDragOrClick(
                        e,
                        store,
                        { source: 'element', id: p.id, kind: 'parallel' },
                        () => store.getState().select({ kind: 'element', id: p.id }),
                      );
                    }}
                  >
                    <title>{t.elements.parallel}</title>
                  </line>
                );
              })}

              {/* Elements */}
              {rl.elements.map((pe) => {
                const el = elements.get(pe.id);
                if (!el) return null;
                return (
                  <ElementView
                    key={pe.id}
                    placed={pe}
                    element={el}
                    x={X(pe.col)}
                    y={Y(pe.row)}
                    selected={selectedIds.has(pe.id)}
                    running={running}
                    power={power}
                    probes={probes}
                    forced={forced}
                    diagnostics={diag.byElement.get(pe.id)}
                    tags={tags}
                    onPress={(e) => {
                      e.stopPropagation();
                      startDragOrClick(
                        e,
                        store,
                        { source: 'element', id: pe.id, kind: pe.kind },
                        (ev) => clickElement(pe.id, ev.shiftKey),
                      );
                    }}
                    onActivate={() => {
                      store.getState().select({ kind: 'element', id: pe.id });
                      store.setState({ focusOperand: Date.now() });
                    }}
                  />
                );
              })}

              {/* Drop zones (only while dragging) */}
              {dragAccepts &&
                rl.zones
                  .map((z, i) => ({ z, key: `${rung.id}:${i}` }))
                  .filter(({ z }) => z.accepts === dragAccepts)
                  .map(({ z, key }) => {
                    const hovered = drag?.zoneKey === key;
                    return (
                      <rect
                        key={key}
                        data-drop={JSON.stringify(z.target)}
                        data-accepts={z.accepts}
                        data-zone-key={key}
                        x={X(z.x)}
                        y={Y(z.y)}
                        width={z.w * CELL_W}
                        height={z.h * CELL_H}
                        rx={4}
                        fill={
                          hovered
                            ? 'color-mix(in srgb, var(--primary) 30%, transparent)'
                            : 'color-mix(in srgb, var(--primary) 8%, transparent)'
                        }
                        stroke="var(--primary)"
                        strokeWidth={hovered ? 2 : 1}
                        strokeDasharray={hovered ? undefined : '4 3'}
                      />
                    );
                  })}
            </g>
          );
        })}
      </svg>

      <div className="px-4 pt-1 pb-8" style={{ paddingLeft: MARGIN_LEFT * zoom }}>
        <button
          type="button"
          onClick={() => store.getState().addRungAfterSelection()}
          className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-text-muted hover:border-primary hover:text-primary"
        >
          + {t.editor.addRung}
        </button>
      </div>
    </div>
  );
}

function ElementView({
  placed,
  element,
  x,
  y,
  selected,
  running,
  power,
  probes,
  forced,
  diagnostics,
  tags,
  onPress,
  onActivate,
}: {
  placed: PlacedElement;
  element: Element;
  x: number;
  y: number;
  selected: boolean;
  running: boolean;
  power: (ref: string) => boolean;
  probes: Record<string, boolean>;
  forced: Record<string, boolean> | undefined;
  diagnostics: LadderDiagnostic[] | undefined;
  tags: readonly Tag[];
  onPress: (e: ReactPointerEvent) => void;
  onActivate: () => void;
}) {
  const t = useStrings();
  const res = resolveOperand(element.operand, tags);
  const label = res.ok
    ? res.tag
      ? res.tag.name
      : res.address
    : element.operand.trim() || t.editor.empty;
  const sub = res.ok && res.tag ? res.address : '';
  const isForced = res.ok && forced?.[res.address] !== undefined;
  const severity = worst(diagnostics);

  const on = (ref: string) => (power(ref) ? 'var(--wire-on)' : 'var(--wire-off)');
  const closed =
    element.kind === 'contact' ? probes[stateProbe(element.id)] === true : power(placed.powerOut);
  const body = running ? (closed ? 'var(--wire-on)' : 'var(--text-muted)') : 'var(--text)';
  const colors = { left: on(placed.powerIn), right: on(placed.powerOut), body };

  const name = t.elements[element.type];
  const problems = diagnostics?.map((d) => diagnosticMessage(d, t)).join('\n');

  return (
    <g
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`${name}: ${label}${sub ? ` (${sub})` : ''}`}
      aria-pressed={selected}
      data-element={element.id}
      className="cursor-pointer outline-none [&:focus-visible>rect.focus]:stroke-primary"
      onPointerDown={onPress}
      onDoubleClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <title>{problems ? `${name}\n${problems}` : name}</title>
      <rect
        className="focus"
        x={3}
        y={5}
        width={CELL_W - 6}
        height={CELL_H - 10}
        rx={5}
        fill={selected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent'}
        stroke={selected ? 'var(--primary)' : 'transparent'}
        strokeWidth={1.5}
      />
      {element.kind === 'contact' ? (
        <ContactShape type={element.type} w={CELL_W} h={CELL_H} colors={colors} />
      ) : (
        <CoilShape type={element.type} w={CELL_W} h={CELL_H} colors={colors} />
      )}
      <text
        x={CELL_W / 2}
        y={CELL_H / 2 - 21}
        textAnchor="middle"
        fontFamily="var(--ff-mono)"
        fontSize={12}
        fontWeight={600}
        fill={res.ok ? 'var(--text)' : 'var(--danger)'}
      >
        {clip(label)}
      </text>
      {sub && (
        <text
          x={CELL_W / 2}
          y={CELL_H / 2 + 30}
          textAnchor="middle"
          fontFamily="var(--ff-mono)"
          fontSize={10.5}
          fill="var(--text-muted)"
        >
          {sub}
        </text>
      )}
      {isForced && (
        <g transform="translate(6 8)">
          <rect width={14} height={14} rx={3} fill="var(--warning)" />
          <text
            x={7}
            y={11}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="var(--on-warning)"
            fontFamily="var(--ff-mono)"
          >
            F
          </text>
          <title>{t.editor.forced}</title>
        </g>
      )}
      {severity && (
        <circle
          cx={CELL_W - 12}
          cy={14}
          r={4.5}
          fill={severity === 'error' ? 'var(--danger)' : 'var(--warning)'}
        />
      )}
    </g>
  );
}
