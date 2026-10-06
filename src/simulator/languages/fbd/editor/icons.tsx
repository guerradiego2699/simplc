/** Small FBD-style icons for the palette (a box with its symbol, inputs as wires). */
import { spec, type InstructionType } from '@/simulator/languages/ladder/catalog';

const MATH: Record<string, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷' };
const COMPARE: Record<string, string> = {
  EQ: '==',
  NE: '<>',
  LT: '<',
  GT: '>',
  LE: '<=',
  GE: '>=',
};

export function FbdIcon({ type, w, h }: { type: InstructionType; w: number; h: number }) {
  const mid = h / 2;
  const stroke = 'var(--text-muted)';
  const text = (s: string, size = 11) => (
    <text
      x={w * 0.62}
      y={mid + size * 0.36}
      textAnchor="middle"
      fontFamily="var(--ff-mono)"
      fontSize={size}
      fontWeight={700}
      fill="var(--text)"
    >
      {s}
    </text>
  );
  const box = (label: string, negatedInput = false, size = 11) => (
    <>
      <line
        x1={2}
        y1={mid}
        x2={negatedInput ? w * 0.3 - 8 : w * 0.3}
        y2={mid}
        stroke={stroke}
        strokeWidth={2}
      />
      {negatedInput && (
        <circle
          cx={w * 0.3 - 4}
          cy={mid}
          r={4}
          fill="var(--bg)"
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
      <rect
        x={w * 0.3}
        y={3}
        width={w * 0.64}
        height={h - 6}
        rx={3}
        fill="var(--bg)"
        stroke="var(--text)"
        strokeWidth={1.5}
      />
      {text(label, size)}
    </>
  );

  if (type === 'NO' || type === 'NC') {
    return (
      <>
        <text x={4} y={mid + 4} fontFamily="var(--ff-mono)" fontSize={11} fill="var(--text)">
          x
        </text>
        <line
          x1={14}
          y1={mid}
          x2={type === 'NC' ? w - 12 : w - 4}
          y2={mid}
          stroke={stroke}
          strokeWidth={2}
        />
        {type === 'NC' && (
          <circle cx={w - 8} cy={mid} r={4} fill="var(--bg)" stroke={stroke} strokeWidth={1.5} />
        )}
      </>
    );
  }
  const family = spec(type).family;
  if (family === 'compare') return box(COMPARE[type] ?? '', false, 10);
  if (type === 'coil') return box('=');
  if (type === 'negated') return box('=', true);
  if (type === 'set') return box('S');
  if (type === 'reset') return box('R');
  if (MATH[type]) return box(MATH[type] ?? '');
  return box(type, false, type.length > 3 ? 8 : 10);
}
