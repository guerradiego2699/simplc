/**
 * Draws one FBD network from its layout. Pure presentation (no store): used by the editor and,
 * without handlers, by static pages. Colours come from tokens; green only for active signals.
 */
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { FbdNetworkLayout } from '../layout';
import type { FbdNode } from '../tree';

const MONO = 'var(--ff-mono)';

export interface FbdViewProps {
  layout: FbdNetworkLayout;
  /** Value of a node in RUN, or null when stopped (wires drawn "off"). */
  value: (node: FbdNode | null) => boolean | null;
  selectedIds?: ReadonlySet<string>;
  /** Severity per element id (diagnostic dot). */
  severity?: (id: string) => 'error' | 'warning' | null;
  /** Live text shown inside a box (timer ET, counter CV…). */
  liveText?: (id: string) => string | undefined;
  onPress?: (e: ReactPointerEvent, id: string, kind: 'contact' | 'coil' | 'parallel') => void;
  onActivate?: (id: string) => void;
  /** Extra drawing on top (drop zones). */
  children?: ReactNode;
  /** Accessible name of each element (type + operand). */
  describe?: (id: string) => string;
}

export function FbdNetworkView({
  layout,
  value,
  selectedIds,
  severity,
  liveText,
  onPress,
  onActivate,
  children,
  describe,
}: FbdViewProps) {
  const color = (node: FbdNode | null) => {
    const v = value(node);
    return v === true ? 'var(--wire-on)' : 'var(--wire-off)';
  };
  const interactive = (id: string, kind: 'contact' | 'coil' | 'parallel') =>
    onPress
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-pressed': selectedIds?.has(id) ?? false,
          'aria-label': describe?.(id),
          'data-element': id,
          className: 'cursor-pointer outline-none [&:focus-visible>.frame]:stroke-primary',
          onPointerDown: (e: ReactPointerEvent) => onPress(e, id, kind),
          onDoubleClick: () => onActivate?.(id),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onActivate?.(id);
            }
          },
        }
      : {};
  const dot = (id: string, x: number, y: number) => {
    const s = severity?.(id);
    return s ? (
      <circle cx={x} cy={y} r={4} fill={s === 'error' ? 'var(--danger)' : 'var(--warning)'} />
    ) : null;
  };

  return (
    <>
      {layout.wires.map((w, i) => (
        <line
          key={i}
          x1={w.x1}
          y1={w.y1}
          x2={w.x2}
          y2={w.y2}
          stroke={color(w.node)}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}

      {layout.constants.map((c, i) => (
        <text
          key={i}
          x={c.x}
          y={c.y + 4}
          textAnchor="end"
          fontFamily={MONO}
          fontSize={12}
          fill="var(--text-muted)"
        >
          1
        </text>
      ))}

      {layout.inputs.map((input) => {
        const selected = selectedIds?.has(input.key) ?? false;
        const stroke = color(input.node);
        const end = input.x + input.w;
        const cy = input.y + 13;
        return (
          <g key={input.key} {...interactive(input.key, 'contact')} data-type={input.element.type}>
            <rect
              className="frame"
              x={input.x - 4}
              y={input.y + 1}
              width={input.w}
              height={24}
              rx={4}
              fill={
                selected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent'
              }
              stroke={selected ? 'var(--primary)' : 'transparent'}
              strokeWidth={1.5}
            />
            <text
              x={end - 24}
              y={cy + 4}
              textAnchor="end"
              fontFamily={MONO}
              fontSize={12}
              fontWeight={600}
              fill="var(--text)"
            >
              {input.text}
            </text>
            <line
              x1={end - 20}
              y1={cy}
              x2={input.negated ? end - 8 : end}
              y2={cy}
              stroke={stroke}
              strokeWidth={2}
            />
            {input.negated && (
              <circle
                cx={end - 4}
                cy={cy}
                r={4}
                fill="var(--bg)"
                stroke={stroke}
                strokeWidth={1.5}
              />
            )}
            {dot(input.key, input.x, input.y + 4)}
          </g>
        );
      })}

      {layout.boxes.map((b) => {
        const id = b.selectId;
        const selected = id ? (selectedIds?.has(id) ?? false) : false;
        const kind = b.role === 'output' ? 'coil' : b.role === 'or' ? 'parallel' : 'contact';
        const gate = b.role === 'and' || b.role === 'or';
        const live = id ? liveText?.(id) : undefined;
        const body = (
          <>
            {b.operand !== undefined && (
              <text
                x={b.x + b.w / 2}
                y={b.y - 4}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={12}
                fontWeight={600}
                fill="var(--text)"
              >
                {b.operand}
              </text>
            )}
            {b.inputs.map((p, i) => (
              <g key={i}>
                <line
                  x1={b.x - 6}
                  y1={p.y}
                  x2={b.x - (p.negated ? 8 : 0)}
                  y2={p.y}
                  stroke={color(p.node)}
                  strokeWidth={2}
                />
                {p.negated && (
                  <circle
                    cx={b.x - 4}
                    cy={p.y}
                    r={4}
                    fill="var(--bg)"
                    stroke={color(p.node)}
                    strokeWidth={1.5}
                  />
                )}
              </g>
            ))}
            <rect
              className="frame"
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={4}
              fill={selected ? 'color-mix(in srgb, var(--primary) 12%, var(--bg))' : 'var(--bg)'}
              stroke={selected ? 'var(--primary)' : 'var(--text)'}
              strokeWidth={selected ? 2 : 1.5}
            />
            <text
              x={b.x + b.w / 2}
              y={gate ? b.y + b.h / 2 + 5 : b.y + 15}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize={13}
              fontWeight={700}
              fill="var(--text)"
            >
              {b.title}
            </text>
            {b.rows.map((r, i) => (
              <text
                key={i}
                x={b.x + 7}
                y={b.y + 20 + i * 17 + 12}
                fontFamily={MONO}
                fontSize={11}
                fill="var(--text-muted)"
              >
                {r}
              </text>
            ))}
            {live && (
              <text
                x={b.x + b.w - 6}
                y={b.y + b.h - 6}
                textAnchor="end"
                fontFamily={MONO}
                fontSize={10.5}
                fill="var(--primary)"
                data-live={live}
              >
                {live}
              </text>
            )}
            {b.role !== 'output' && (
              <line
                x1={b.x + b.w}
                y1={b.outY}
                x2={b.x + b.w + 6}
                y2={b.outY}
                stroke={color(b.node)}
                strokeWidth={2}
              />
            )}
            {id && dot(id, b.x + b.w - 6, b.y + 6)}
          </>
        );
        return id ? (
          <g
            key={b.key}
            {...interactive(id, kind)}
            data-type={b.element?.type ?? b.role}
            data-box={b.role}
          >
            {body}
          </g>
        ) : (
          <g key={b.key} data-box={b.role}>
            {body}
          </g>
        );
      })}
      {children}
    </>
  );
}
