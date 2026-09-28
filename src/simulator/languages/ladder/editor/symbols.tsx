/**
 * IEC 61131-3 Ladder symbols drawn in SVG, shared by the palette and the editor.
 * Geometry is relative to a cell of width `w` and height `h` whose wire runs at mid-height.
 */
import type { CoilType, ContactType } from '../model';

export interface SymbolColors {
  /** Wire stub entering the symbol. */
  left: string;
  /** Wire stub leaving the symbol. */
  right: string;
  /** Plates / arcs of the symbol itself. */
  body: string;
}

const STROKE = 2.25;

export function ContactShape({
  type,
  w,
  h,
  colors,
}: {
  type: ContactType;
  w: number;
  h: number;
  colors: SymbolColors;
}) {
  const cx = w / 2;
  const cy = h / 2;
  const gap = 10;
  const half = 14;
  return (
    <g fill="none" strokeWidth={STROKE} strokeLinecap="round">
      <line x1={0} y1={cy} x2={cx - gap} y2={cy} stroke={colors.left} />
      <line x1={cx + gap} y1={cy} x2={w} y2={cy} stroke={colors.right} />
      <line
        x1={cx - gap}
        y1={cy - half}
        x2={cx - gap}
        y2={cy + half}
        stroke={colors.body}
        strokeWidth={STROKE + 0.5}
      />
      <line
        x1={cx + gap}
        y1={cy - half}
        x2={cx + gap}
        y2={cy + half}
        stroke={colors.body}
        strokeWidth={STROKE + 0.5}
      />
      {type === 'NC' && (
        <line
          x1={cx - gap - 5}
          y1={cy + half + 1}
          x2={cx + gap + 5}
          y2={cy - half - 1}
          stroke={colors.body}
        />
      )}
      {(type === 'P' || type === 'N') && (
        <text
          x={cx}
          y={cy + 4.5}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fontFamily="var(--ff-mono)"
          fill={colors.body}
          stroke="none"
        >
          {type}
        </text>
      )}
    </g>
  );
}

export function CoilShape({
  type,
  w,
  h,
  colors,
}: {
  type: CoilType;
  w: number;
  h: number;
  colors: SymbolColors;
}) {
  const cx = w / 2;
  const cy = h / 2;
  const r = 14;
  const letter = type === 'set' ? 'S' : type === 'reset' ? 'R' : null;
  return (
    <g fill="none" strokeWidth={STROKE} strokeLinecap="round">
      <line x1={0} y1={cy} x2={cx - r + 2} y2={cy} stroke={colors.left} />
      <line x1={cx + r - 2} y1={cy} x2={w} y2={cy} stroke={colors.right} />
      <path
        d={`M${cx - 5} ${cy - r} Q${cx - r - 4} ${cy} ${cx - 5} ${cy + r} M${cx + 5} ${cy - r} Q${cx + r + 4} ${cy} ${cx + 5} ${cy + r}`}
        stroke={colors.body}
        strokeWidth={STROKE + 0.5}
      />
      {type === 'negated' && (
        <line x1={cx - 5} y1={cy + 8} x2={cx + 5} y2={cy - 8} stroke={colors.body} />
      )}
      {letter && (
        <text
          x={cx}
          y={cy + 4.5}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fontFamily="var(--ff-mono)"
          fill={colors.body}
          stroke="none"
        >
          {letter}
        </text>
      )}
    </g>
  );
}
