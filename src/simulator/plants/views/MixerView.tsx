/**
 * Batch mixer view (example 11): two ingredient valves, agitator, drain, level switches and the
 * grade of each finished batch. Ingredient A is drawn in --primary and B in --warning; while
 * stirring, the two layers blend.
 */
import { fmt } from '@/simulator/ui/context';
import { MIXER, type MixerState } from '@/simulator/plants/mixer';
import type { PlantViewProps } from './PlantViews';
import { label, Status, svgClass, usePrefersReducedMotion, useRotorAngle } from './shared';

const valve = (x: number, y: number, open: boolean, testId: string) => (
  <path
    d={`M${x - 10} ${y - 8} L ${x + 10} ${y + 8} L ${x + 10} ${y - 8} L ${x - 10} ${y + 8} Z`}
    fill={open ? 'var(--primary)' : 'var(--surface-2)'}
    stroke="var(--border)"
    data-testid={testId}
    data-on={open}
  />
);

export function MixerView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as MixerState | null) ?? {
    a: 0,
    b: 0,
    peakA: 0,
    peakB: 0,
    mixedMs: 0,
    ok: 0,
    bad: 0,
    last: null,
    spilled: false,
  };
  const m = t.mixer;
  const reduced = usePrefersReducedMotion();
  const stirring = out('Q0.2');
  const angle = useRotorAngle(stirring ? 1 : 0, !reduced && onCommand !== undefined);
  const top = 40;
  const bottom = 170;
  const scale = (bottom - top) / 100;
  const level = s.a + s.b;
  const mix = Math.min(1, s.mixedMs / MIXER.mixMs);
  const aH = s.a * scale;
  const bH = s.b * scale;
  const yOf = (pct: number) => bottom - pct * scale;
  const paddle = Math.abs(Math.cos((angle * Math.PI) / 180)) * 30 + 4;
  const seconds = (ms: number) => Math.floor(ms / 1000);

  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="mixer">
      <svg viewBox="0 0 400 190" className={svgClass} role="img" aria-label={t.names.mixer}>
        {/* Inlets */}
        <path d="M20 22 H 150 V 40" className="fill-none stroke-border" strokeWidth={5} />
        <path d="M380 22 H 250 V 40" className="fill-none stroke-border" strokeWidth={5} />
        {valve(80, 22, out('Q0.0'), 'plant-valve-a')}
        {valve(320, 22, out('Q0.1'), 'plant-valve-b')}
        <text x={80} y={46} textAnchor="middle" className={label}>
          A · Q0.0
        </text>
        <text x={320} y={46} textAnchor="middle" className={label}>
          B · Q0.1
        </text>

        {/* Tank and liquid */}
        <rect
          x={130}
          y={top}
          width={140}
          height={bottom - top}
          rx={6}
          className="fill-bg stroke-border"
          strokeWidth={2}
        />
        <rect
          x={132}
          y={bottom - aH}
          width={136}
          height={aH}
          fill="var(--primary)"
          opacity={0.45 * (1 - mix) + 0.2}
        />
        <rect
          x={132}
          y={bottom - aH - bH}
          width={136}
          height={bH}
          fill="var(--warning)"
          opacity={0.45 * (1 - mix) + 0.2}
        />
        {mix > 0 && level > 0 && (
          <rect
            x={132}
            y={bottom - aH - bH}
            width={136}
            height={aH + bH}
            fill="var(--warning)"
            opacity={0.3 * mix}
          />
        )}
        <text
          x={160}
          y={yOf(Math.max(level, 20)) + 18}
          textAnchor="middle"
          className="fill-text text-[14px] font-semibold"
          data-testid="plant-level"
        >
          {Math.round(level)} %
        </text>

        {/* Agitator */}
        <rect
          x={185}
          y={4}
          width={30}
          height={22}
          rx={4}
          fill={stirring ? 'var(--led-on)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-agitator"
          data-on={stirring}
        />
        <text
          x={200}
          y={19}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill={stirring ? 'var(--on-led)' : 'var(--text)'}
        >
          M
        </text>
        <line x1={200} y1={26} x2={200} y2={150} stroke="var(--text-muted)" strokeWidth={3} />
        <rect
          x={200 - paddle / 2}
          y={146}
          width={paddle}
          height={8}
          rx={2}
          fill="var(--text-muted)"
        />
        <text x={222} y={19} className={label}>
          Q0.2
        </text>

        {/* Level switches */}
        {(
          [
            [MIXER.full, 'I0.3', level >= MIXER.full],
            [MIXER.levelA, 'I0.2', level >= MIXER.levelA],
            [MIXER.emptyAt, 'I0.4', level <= MIXER.emptyAt],
          ] as const
        ).map(([pct, address, on]) => (
          <g key={address} data-testid={`plant-switch-${address}`} data-on={on}>
            <circle
              cx={282}
              cy={yOf(pct)}
              r={6}
              fill={on ? 'var(--led-on)' : 'var(--surface-2)'}
              stroke="var(--border)"
            />
            <text x={294} y={yOf(pct) + 4} className={label}>
              {address}
            </text>
          </g>
        ))}

        {/* Drain */}
        <path d="M200 170 V 182 H 380" className="fill-none stroke-border" strokeWidth={5} />
        {valve(300, 182, out('Q0.3'), 'plant-drain')}
        <text x={340} y={176} className={label}>
          Q0.3
        </text>

        {/* Batch done light */}
        <circle
          cx={360}
          cy={80}
          r={11}
          fill={out('Q0.4') ? 'var(--warning)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-done-light"
          data-on={out('Q0.4')}
        />
        <text x={360} y={106} textAnchor="middle" className={label}>
          Q0.4
        </text>

        {/* Batch data */}
        <text x={10} y={76} className="fill-text text-[11px]">
          {fmt(m.ingredientA, { n: Math.round(s.a) })}
        </text>
        <text x={10} y={92} className="fill-text text-[11px]">
          {fmt(m.ingredientB, { n: Math.round(s.b) })}
        </text>
        <text x={10} y={108} className="fill-text text-[11px]" data-testid="plant-mixing">
          {fmt(m.mixing, { s: seconds(s.mixedMs), total: seconds(MIXER.mixMs) })}
        </text>
        <text
          x={10}
          y={140}
          className="fill-text text-[11px] font-semibold"
          data-testid="plant-batches-ok"
        >
          {fmt(m.ok, { n: s.ok })}
        </text>
        <text
          x={10}
          y={156}
          className="fill-danger text-[11px] font-semibold"
          data-testid="plant-batches-bad"
        >
          {fmt(m.bad, { n: s.bad })}
        </text>
      </svg>
      {s.spilled && (
        <p className="text-center text-xs font-semibold text-danger" role="alert">
          {m.spilled}
        </p>
      )}
      {s.last === 'bad' && !s.spilled && (
        <p className="text-center text-xs font-semibold text-danger" role="alert">
          {m.lastBad}
        </p>
      )}
      {s.last === 'ok' && <p className="text-center text-xs text-text-muted">{m.lastOk}</p>}
      <Status items={[fmt(m.ok, { n: s.ok }), fmt(m.bad, { n: s.bad })]} />
    </figure>
  );
}
