/**
 * FBD editor: the program's rungs shown as networks of blocks. Editing reuses the Ladder model
 * operations (insert, move, delete, wrap in OR…), so LD ↔ FBD switching never loses anything.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatTime } from '@/simulator/engine';
import { acceptsOf, startDragOrClick } from '@/simulator/ui/drag';
import { indexDiagnostics, worst } from '@/simulator/ui/diagnostics';
import { fmt, useLocale, useSim, useStoreApi, useStrings } from '@/simulator/ui/context';
import { displayOperand, liveValue } from '@/simulator/languages/ladder/editor/ElementView';
import { allElements } from '@/simulator/languages/ladder/model';
import { spec } from '@/simulator/languages/ladder/catalog';
import { layoutFbdNetwork } from '../layout';
import { nodeValue } from '../tree';
import { FbdNetworkView } from './FbdNetworkView';

const HEADER_H = 30;
const NETWORK_GAP = 14;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function FbdEditor() {
  const t = useStrings();
  const locale = useLocale() === 'es' ? 'es-CL' : 'en-US';
  const store = useStoreApi();
  const {
    ladder,
    tags,
    diagnostics,
    selection,
    drag,
    status,
    probes,
    zoom,
    snapshot,
    style,
    executing,
  } = useSim(
    useShallow((s) => ({
      ladder: s.project.ladder,
      tags: s.project.tags,
      diagnostics: s.compiled.diagnostics,
      selection: s.selection,
      drag: s.drag,
      status: s.status,
      probes: s.probes,
      zoom: s.zoom,
      snapshot: s.snapshot,
      style: s.addressStyle,
      executing:
        s.scanView.active && s.scanView.event?.phase === 'execute'
          ? s.scanView.event.networkId
          : null,
    })),
  );

  const label = (text: string) => displayOperand(text, tags, style, t.editor.empty).label;
  const layouts = useMemo(
    () =>
      ladder.rungs.map((r) =>
        layoutFbdNetwork(r, (text) => displayOperand(text, tags, style, t.editor.empty).label),
      ),
    [ladder, tags, style, t],
  );
  const elements = useMemo(() => new Map(allElements(ladder).map((e) => [e.id, e])), [ladder]);
  const diag = useMemo(() => indexDiagnostics(diagnostics), [diagnostics]);
  const running = status !== 'stopped';
  const dragAccepts = drag ? acceptsOf(drag.item) : null;

  const selectedIds = new Set(
    selection?.kind === 'element'
      ? [selection.id]
      : selection?.kind === 'range'
        ? selection.ids
        : [],
  );

  // Ctrl + wheel zoom.
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

  /** Live text inside timer/counter boxes. */
  const liveText = (id: string) => {
    if (!running || !snapshot) return undefined;
    const el = elements.get(id);
    if (!el) return undefined;
    const family = spec(el.type).family;
    const address = displayOperand(el.operand, tags, 'generic', '').address;
    if (!address) return undefined;
    if (family === 'timer') {
      const et = liveValue(`${address}.ET`, snapshot);
      return typeof et === 'number' ? formatTime(et, locale) : undefined;
    }
    if (family === 'counter') {
      const cv = liveValue(`${address}.CV`, snapshot);
      return typeof cv === 'number' ? `CV ${cv}` : undefined;
    }
    return undefined;
  };

  const describe = (id: string) => {
    const el = elements.get(id);
    if (!el) return t.elements.parallel;
    const names = t.fbd.elements as Record<string, string>;
    return `${names[el.type] ?? t.elements[el.type]}: ${label(el.operand)}`;
  };

  const width = Math.max(480, ...layouts.map((l) => l.w));
  const tops: number[] = [];
  let height = 0;
  for (const l of layouts) {
    tops.push(height);
    height += HEADER_H + l.h + NETWORK_GAP;
  }

  return (
    <div
      ref={scroller}
      className="relative h-full overflow-auto bg-bg"
      style={{
        backgroundImage:
          'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)',
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundAttachment: 'local',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) store.getState().select(null);
      }}
      data-testid="fbd-editor"
    >
      <svg
        width={width * zoom}
        height={(height + 8) * zoom}
        viewBox={`0 0 ${width} ${height + 8}`}
        role="application"
        aria-label={t.fbd.label}
        className="block select-none"
        onPointerDown={(e) => {
          if (e.target instanceof SVGElement && e.target.dataset['background'] !== undefined) {
            store.getState().select(null);
          }
        }}
      >
        <rect data-background width={width} height={height + 8} fill="transparent" />
        {layouts.map((l, index) => {
          const rung = ladder.rungs[index];
          if (!rung) return null;
          const top = tops[index] ?? 0;
          const rungSelected = selection?.kind === 'rung' && selection.id === rung.id;
          const rungWorst = worst(diag.byRung.get(rung.id));
          return (
            <g key={rung.id} data-rung={rung.id} data-network={index + 1}>
              <g
                role="button"
                tabIndex={0}
                aria-label={`${fmt(t.fbd.network, { n: index + 1 })}. ${rung.comment || t.editor.noComment}`}
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
                  {fmt(t.fbd.network, { n: index + 1 })}
                </text>
                {rungWorst && (
                  <circle
                    cx={8}
                    cy={top + 16}
                    r={4}
                    fill={rungWorst === 'error' ? 'var(--danger)' : 'var(--warning)'}
                  />
                )}
                <text
                  x={84}
                  y={top + 20}
                  fontSize={12.5}
                  fill={rung.comment ? 'var(--text)' : 'var(--text-muted)'}
                  fontStyle={rung.comment ? 'normal' : 'italic'}
                  opacity={rung.comment ? 1 : 0.7}
                >
                  {clip(rung.comment || t.editor.noComment, Math.floor((width - 90) / 7))}
                </text>
              </g>

              {executing === rung.id && (
                <rect
                  data-executing
                  x={4}
                  y={top + HEADER_H - 2}
                  width={width - 8}
                  height={l.h + 4}
                  rx={6}
                  fill="color-mix(in srgb, var(--primary) 9%, transparent)"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
              )}

              <g transform={`translate(0 ${top + HEADER_H})`}>
                <rect
                  x={8}
                  y={0}
                  width={width - 16}
                  height={l.h}
                  rx={6}
                  fill="var(--surface)"
                  opacity={0.5}
                />
                <FbdNetworkView
                  layout={l}
                  value={(node) => (running ? (node ? nodeValue(node, probes) : true) : null)}
                  selectedIds={selectedIds}
                  severity={(id) => worst(diag.byElement.get(id))}
                  liveText={liveText}
                  describe={describe}
                  onPress={(e, id, kind) => {
                    e.stopPropagation();
                    startDragOrClick(e, store, { source: 'element', id, kind }, () =>
                      store.getState().select({ kind: 'element', id }),
                    );
                  }}
                  onActivate={(id) => {
                    store.getState().select({ kind: 'element', id });
                    store.setState({ focusOperand: Date.now() });
                  }}
                >
                  {dragAccepts &&
                    l.zones
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
                            x={z.x}
                            y={z.y}
                            width={z.w}
                            height={z.h}
                            rx={3}
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
                </FbdNetworkView>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="px-4 pt-1 pb-8">
        <button
          type="button"
          onClick={() => store.getState().addRungAfterSelection()}
          className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-text-muted hover:border-primary hover:text-primary"
        >
          + {t.fbd.addNetwork}
        </button>
      </div>
    </div>
  );
}
