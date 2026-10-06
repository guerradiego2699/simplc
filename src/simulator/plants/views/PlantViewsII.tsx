/**
 * SVG views of the second set of plants (examples 3, 5, 7, 8, 9, 10, 12, 13, 14).
 * Same conventions as PlantViews: tokens only, green (--led-on) only for active signals,
 * lamps in --warning, faults in --danger, motion off with prefers-reduced-motion.
 */
import type { ReactNode } from 'react';
import { fmt } from '@/simulator/ui/context';
import {
  CONVEYOR,
  GATE,
  OVEN,
  PARKING,
  PUMPS,
  SORTER,
  type ConveyorState,
  type GateState,
  type LevelControlState,
  type OvenState,
  type ParkingState,
  type PumpsState,
  type ReversingState,
  type SorterState,
  type StarDeltaState,
} from '@/simulator/plants/models-ii';
import { ANALOG_FULL_SCALE } from '@/simulator/plants/types';
import type { PlantViewProps } from './PlantViews';
import { label, Status, svgClass, usePrefersReducedMotion, useRotorAngle } from './shared';

const on = (v: boolean) => (v ? 'var(--led-on)' : 'var(--surface-2)');
const onText = (v: boolean) => (v ? 'var(--on-led)' : 'var(--text)');

function Buttons({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-2">{children}</div>;
}

function CommandButton({
  onClick,
  disabled,
  danger,
  pressed,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
        danger
          ? 'border-danger text-danger hover:bg-danger hover:text-on-danger disabled:hover:bg-transparent disabled:hover:text-danger'
          : 'border-border text-text hover:bg-surface-2 disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="text-center text-xs font-semibold text-danger" role="alert">
      {text}
    </p>
  );
}

/** Contactor box with its name and address; green when energized. */
function Contactor({
  x,
  y,
  name,
  address,
  active,
  testId,
}: {
  x: number;
  y: number;
  name: string;
  address: string;
  active: boolean;
  testId: string;
}) {
  return (
    <g data-testid={testId} data-on={active}>
      <rect x={x} y={y} width={70} height={34} rx={6} fill={on(active)} stroke="var(--border)" />
      <text
        x={x + 35}
        y={y + 22}
        textAnchor="middle"
        className="text-[12px] font-semibold"
        fill={onText(active)}
      >
        {name}
      </text>
      <text x={x + 35} y={y + 48} textAnchor="middle" className={label}>
        {address}
      </text>
    </g>
  );
}

/** Motor body with a fan that turns with `angle`. */
function Motor({ cx, cy, angle }: { cx: number; cy: number; angle: number }) {
  return (
    <g>
      <rect
        x={cx - 55}
        y={cy - 55}
        width={110}
        height={110}
        rx={14}
        className="fill-surface-2 stroke-border"
        strokeWidth={2}
      />
      <circle cx={cx} cy={cy} r={40} className="fill-bg stroke-border" strokeWidth={2} />
      <g transform={`rotate(${angle} ${cx} ${cy})`} data-testid="plant-rotor">
        {[0, 90, 180, 270].map((a) => (
          <path
            key={a}
            d={`M${cx} ${cy} L ${cx} ${cy - 33} A 10 10 0 0 1 ${cx + 13} ${cy - 25} Z`}
            transform={`rotate(${a} ${cx} ${cy})`}
            fill="var(--primary)"
            opacity={0.8}
          />
        ))}
        <circle cx={cx} cy={cy} r={6} fill="var(--text-muted)" />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------------- reversing

export function ReversingView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as ReversingState | null) ?? { speed: 0, tripped: false, shortCircuit: false };
  const r = t.reversing;
  const reduced = usePrefersReducedMotion();
  const angle = useRotorAngle(s.speed, !reduced && onCommand !== undefined);
  const direction = s.speed > 0.01 ? r.forward : s.speed < -0.01 ? r.reverse : r.stopped;
  const percent = Math.round(Math.abs(s.speed) * 100);
  return (
    <figure
      className="flex h-full flex-col items-center justify-center gap-2"
      data-plant="reversing"
    >
      <svg viewBox="0 0 360 180" className={svgClass} role="img" aria-label={t.names.reversing}>
        <Contactor
          x={14}
          y={14}
          name="KM ▶"
          address="Q0.0"
          active={out('Q0.0')}
          testId="plant-km-forward"
        />
        <Contactor
          x={14}
          y={74}
          name="KM ◀"
          address="Q0.1"
          active={out('Q0.1')}
          testId="plant-km-reverse"
        />
        <rect
          x={14}
          y={136}
          width={70}
          height={28}
          rx={6}
          fill={s.tripped || s.shortCircuit ? 'var(--danger)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-relay"
          data-tripped={s.tripped}
        />
        <text
          x={49}
          y={155}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill={s.tripped || s.shortCircuit ? 'var(--on-danger)' : 'var(--text)'}
        >
          F1 · I0.3
        </text>
        <Motor cx={190} cy={85} angle={angle} />
        <text x={190} y={168} textAnchor="middle" className={label} data-testid="plant-direction">
          {direction} · {percent} %
        </text>
        <path
          d={s.speed >= 0 ? 'M300 60 a 30 30 0 1 1 0 50' : 'M330 110 a 30 30 0 1 1 0 -50'}
          fill="none"
          stroke={Math.abs(s.speed) > 0.01 ? 'var(--primary)' : 'var(--border)'}
          strokeWidth={3}
          markerEnd="url(#arrow)"
        />
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX={5}
            refY={5}
            markerWidth={5}
            markerHeight={5}
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--primary)" />
          </marker>
        </defs>
      </svg>
      {s.shortCircuit && <Warning text={r.shortCircuit} />}
      {onCommand && (
        <Buttons>
          <CommandButton danger disabled={s.tripped} onClick={() => onCommand('overload')}>
            {t.motor.overload}
          </CommandButton>
          <CommandButton
            disabled={!s.tripped && !s.shortCircuit}
            onClick={() => onCommand('resetOverload')}
          >
            {r.reset}
          </CommandButton>
        </Buttons>
      )}
      <Status items={[`${r.direction}: ${direction}`, `${t.motor.speed}: ${percent} %`]} />
    </figure>
  );
}

// --------------------------------------------------------------------------------------- gate

export function GateView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as GateState | null) ?? {
    position: 0,
    obstacle: false,
    hit: false,
    jammed: false,
  };
  const g = t.gate;
  // Passage from `left` to `left + span`; the panel slides right and parks along the wall.
  const left = 40;
  const span = 150;
  const panelX = left + (s.position / 100) * span;
  const beamY = 128;
  const limitOpen = s.position >= 100;
  const limitClosed = s.position <= 0;
  const canToggle = s.obstacle || s.position >= GATE.carZone;
  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="gate">
      <svg viewBox="0 0 380 180" className={svgClass} role="img" aria-label={t.names.gate}>
        {/* Beacon */}
        <circle
          cx={24}
          cy={24}
          r={11}
          fill={out('Q0.2') ? 'var(--warning)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-beacon"
          data-on={out('Q0.2')}
        />
        <text x={42} y={28} className={label}>
          Q0.2
        </text>
        {/* Wall where the open panel parks, posts and track */}
        <rect
          x={left + span}
          y={66}
          width={span + 4}
          height={78}
          className="fill-surface-2"
          opacity={0.6}
        />
        <rect
          x={left - 14}
          y={60}
          width={14}
          height={90}
          className="fill-surface-2 stroke-border"
        />
        <rect
          x={left + span - 4}
          y={60}
          width={8}
          height={90}
          className="fill-surface-2 stroke-border"
        />
        <line
          x1={left}
          y1={150}
          x2={left + span * 2 + 4}
          y2={150}
          className="stroke-border"
          strokeWidth={3}
        />
        {/* Car (obstacle) */}
        {s.obstacle && (
          <g data-testid="plant-car">
            <rect
              x={left + 22}
              y={108}
              width={100}
              height={30}
              rx={8}
              fill="var(--primary)"
              opacity={0.7}
            />
            <circle cx={left + 44} cy={140} r={8} fill="var(--text)" />
            <circle cx={left + 100} cy={140} r={8} fill="var(--text)" />
          </g>
        )}
        {/* Gate panel */}
        <g data-testid="plant-gate-panel" data-position={Math.round(s.position)}>
          <rect
            x={panelX}
            y={70}
            width={span}
            height={70}
            rx={3}
            fill="var(--bg)"
            stroke="var(--text)"
            strokeWidth={2}
          />
          {Array.from({ length: 6 }, (_, i) => (
            <line
              key={i}
              x1={panelX + 21.4 * (i + 1)}
              y1={72}
              x2={panelX + 21.4 * (i + 1)}
              y2={138}
              className="stroke-border"
            />
          ))}
        </g>
        {/* Photocell beam across the passage */}
        <line
          x1={left}
          y1={beamY}
          x2={left + span}
          y2={beamY}
          stroke={s.obstacle ? 'var(--danger)' : 'var(--primary)'}
          strokeDasharray="5 4"
          strokeWidth={2}
          data-testid="plant-photocell"
          data-clear={!s.obstacle}
        />
        <text x={left + span / 2} y={170} textAnchor="middle" className={label}>
          I0.4 · {g.photocell}
        </text>
        {/* Limit switches: closed at the left post, open at the end of the wall */}
        <circle
          cx={left + 5}
          cy={62}
          r={6}
          fill={on(limitClosed)}
          stroke="var(--border)"
          data-testid="plant-ls-closed"
          data-on={limitClosed}
        />
        <text x={left + 15} y={58} className={label}>
          I0.3
        </text>
        <circle
          cx={left + span * 2 - 2}
          cy={62}
          r={6}
          fill={on(limitOpen)}
          stroke="var(--border)"
          data-testid="plant-ls-open"
          data-on={limitOpen}
        />
        <text x={left + span * 2 - 12} y={58} textAnchor="end" className={label}>
          I0.2
        </text>
        {/* Motor commands and position */}
        <text
          x={190}
          y={18}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill={out('Q0.0') ? 'var(--primary)' : 'var(--text-muted)'}
        >
          Q0.0 ▶
        </text>
        <text
          x={190}
          y={34}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill={out('Q0.1') ? 'var(--primary)' : 'var(--text-muted)'}
        >
          ◀ Q0.1
        </text>
        <text x={360} y={24} textAnchor="end" className={label}>
          {g.position} {Math.round(s.position)} %
        </text>
      </svg>
      {s.hit && <Warning text={g.hit} />}
      {s.jammed && <Warning text={g.jammed} />}
      {onCommand && (
        <Buttons>
          <CommandButton
            disabled={!canToggle}
            pressed={s.obstacle}
            onClick={() => onCommand('toggleObstacle')}
          >
            {s.obstacle ? g.removeObstacle : g.addObstacle}
          </CommandButton>
        </Buttons>
      )}
      {onCommand && !canToggle && (
        <p className="text-center text-xs text-text-muted">{g.needsOpen}</p>
      )}
      <Status items={[`${g.position}: ${Math.round(s.position)} %`]} />
    </figure>
  );
}

// --------------------------------------------------------------------------------- star-delta

export function StarDeltaView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as StarDeltaState | null) ?? {
    speed: 0,
    current: 0,
    peak: 0,
    tripped: false,
    shortCircuit: false,
  };
  const d = t.starDelta;
  const reduced = usePrefersReducedMotion();
  const angle = useRotorAngle(s.speed, !reduced && onCommand !== undefined);
  const main = out('Q0.0');
  const connection =
    main && out('Q0.1') && !out('Q0.2')
      ? d.star
      : main && out('Q0.2') && !out('Q0.1')
        ? d.delta
        : d.off;
  const barH = 120;
  const scale = (x: number) => Math.min(1, x / 6) * barH;
  const times = (x: number) =>
    fmt(d.times, { n: x.toLocaleString(undefined, { maximumFractionDigits: 1 }) });
  return (
    <figure
      className="flex h-full flex-col items-center justify-center gap-2"
      data-plant="starDelta"
    >
      <svg viewBox="0 0 400 180" className={svgClass} role="img" aria-label={t.names.starDelta}>
        <Contactor x={10} y={8} name="K1" address="Q0.0" active={main} testId="plant-k1" />
        <Contactor
          x={10}
          y={64}
          name="K2 ⅄"
          address="Q0.1"
          active={out('Q0.1')}
          testId="plant-k2"
        />
        <Contactor
          x={10}
          y={120}
          name="K3 △"
          address="Q0.2"
          active={out('Q0.2')}
          testId="plant-k3"
        />
        <Motor cx={175} cy={80} angle={angle} />
        <text x={175} y={160} textAnchor="middle" className={label} data-testid="plant-connection">
          {d.connection}: {connection} · {Math.round(s.speed * 100)} %
        </text>
        {/* Current bar, 0–6 × rated */}
        <rect
          x={262}
          y={20}
          width={22}
          height={barH}
          rx={4}
          className="fill-surface-2 stroke-border"
        />
        <rect
          x={262}
          y={20 + barH - scale(s.current)}
          width={22}
          height={scale(s.current)}
          rx={4}
          fill="var(--warning)"
        />
        <line
          x1={256}
          x2={290}
          y1={20 + barH - scale(s.peak)}
          y2={20 + barH - scale(s.peak)}
          stroke="var(--danger)"
          strokeWidth={2}
          data-testid="plant-peak"
          data-peak={s.peak.toFixed(2)}
        />
        <text x={294} y={34} className={label}>
          {d.current}
        </text>
        <text x={294} y={50} className="fill-text text-[11px] font-semibold">
          {times(s.current)}
        </text>
        <text x={294} y={72} className={label}>
          {d.peak}
        </text>
        <text x={294} y={88} className="fill-danger text-[11px] font-semibold">
          {times(s.peak)}
        </text>
      </svg>
      {s.shortCircuit && <Warning text={d.shortCircuit} />}
      {onCommand && (
        <Buttons>
          <CommandButton danger disabled={s.tripped} onClick={() => onCommand('overload')}>
            {t.motor.overload}
          </CommandButton>
          <CommandButton
            disabled={!s.tripped && !s.shortCircuit}
            onClick={() => onCommand('resetOverload')}
          >
            {t.reversing.reset}
          </CommandButton>
        </Buttons>
      )}
      <Status items={[`${d.connection}: ${connection}`, `${d.current}: ${times(s.current)}`]} />
    </figure>
  );
}

// ----------------------------------------------------------------------------------- conveyor

/** A belt drawn from x0 to x0 + w at height y; returns x for a position in %. */
const beltX = (pos: number, x0: number, w: number) => x0 + (pos / 100) * w;

export function ConveyorView({ state, out, t }: PlantViewProps) {
  const s = (state as ConveyorState | null) ?? { boxes: [0], delivered: 0 };
  const c = t.conveyor;
  const x0 = 20;
  const w = 320;
  const sensorX = beltX(CONVEYOR.sensorAt, x0, w);
  const detecting = s.boxes.some((p) => Math.abs(p - CONVEYOR.sensorAt) <= CONVEYOR.halfBox);
  return (
    <figure
      className="flex h-full flex-col items-center justify-center gap-2"
      data-plant="conveyor"
    >
      <svg viewBox="0 0 380 170" className={svgClass} role="img" aria-label={t.names.conveyor}>
        <rect
          x={x0 - 10}
          y={110}
          width={w + 20}
          height={16}
          rx={8}
          className="fill-surface-2 stroke-border"
          strokeWidth={2}
        />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <circle
            key={i}
            cx={x0 + (w / 6) * i}
            cy={118}
            r={5}
            fill={out('Q0.0') ? 'var(--led-on)' : 'var(--border)'}
          />
        ))}
        {s.boxes.map((p, i) => (
          <rect
            key={i}
            x={beltX(p, x0, w) - 13}
            y={84}
            width={26}
            height={26}
            rx={3}
            fill="var(--warning)"
            opacity={0.85}
            stroke="var(--text)"
            strokeWidth={1}
            data-box
          />
        ))}
        {/* Photocell */}
        <line
          x1={sensorX}
          y1={50}
          x2={sensorX}
          y2={110}
          stroke={detecting ? 'var(--led-on)' : 'var(--primary)'}
          strokeDasharray="4 3"
          strokeWidth={2}
        />
        <rect
          x={sensorX - 9}
          y={36}
          width={18}
          height={14}
          rx={3}
          fill={on(detecting)}
          stroke="var(--border)"
          data-testid="plant-box-sensor"
          data-on={detecting}
        />
        <text x={sensorX} y={28} textAnchor="middle" className={label}>
          I0.2 · {c.sensor}
        </text>
        {/* Batch light */}
        <circle
          cx={360}
          cy={30}
          r={11}
          fill={out('Q0.1') ? 'var(--warning)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-batch-light"
          data-on={out('Q0.1')}
        />
        <text x={360} y={56} textAnchor="middle" className={label}>
          Q0.1
        </text>
        <text
          x={x0}
          y={150}
          className="fill-text text-[12px] font-semibold"
          data-testid="plant-delivered"
        >
          {fmt(c.delivered, { n: s.delivered })}
        </text>
        <text x={x0 + w} y={150} textAnchor="end" className={label}>
          Q0.0
        </text>
      </svg>
      <Status items={[fmt(c.delivered, { n: s.delivered })]} />
    </figure>
  );
}

// ------------------------------------------------------------------------------------ parking

export function ParkingView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as ParkingState | null) ?? {
    waiting: 0,
    parked: 0,
    entering: 0,
    leaving: 0,
    barrierMs: 0,
  };
  const p = t.parking;
  const full = out('Q0.0');
  const barrier = out('Q0.1');
  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="parking">
      <svg viewBox="0 0 380 170" className={svgClass} role="img" aria-label={t.names.parking}>
        {/* Spaces: 2 rows × 5 */}
        {Array.from({ length: PARKING.capacity }, (_, i) => {
          const x = 150 + (i % 5) * 44;
          const y = i < 5 ? 14 : 100;
          const taken = i < s.parked;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={40}
                height={56}
                rx={3}
                fill="none"
                className="stroke-border"
                strokeDasharray="4 3"
              />
              {taken && (
                <rect
                  x={x + 6}
                  y={y + 8}
                  width={28}
                  height={40}
                  rx={6}
                  fill="var(--primary)"
                  opacity={0.75}
                  data-parked
                />
              )}
            </g>
          );
        })}
        {/* Sign */}
        <rect
          x={14}
          y={14}
          width={86}
          height={30}
          rx={5}
          fill={full ? 'var(--danger)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-full-sign"
          data-on={full}
        />
        <text
          x={57}
          y={34}
          textAnchor="middle"
          className="text-[13px] font-bold"
          fill={full ? 'var(--on-danger)' : 'var(--text-muted)'}
        >
          {full ? p.full : p.free}
        </text>
        <text x={57} y={58} textAnchor="middle" className={label}>
          Q0.0
        </text>
        {/* Entry barrier (pivot at 30,120) */}
        <line
          x1={30}
          y1={120}
          x2={barrier ? 30 : 120}
          y2={barrier ? 72 : 120}
          stroke="var(--warning)"
          strokeWidth={6}
          strokeLinecap="round"
          data-testid="plant-barrier"
          data-open={barrier}
        />
        <circle cx={30} cy={120} r={7} fill="var(--text)" />
        <text x={30} y={146} className={label}>
          Q0.1
        </text>
        {/* Entry / exit sensors */}
        <circle cx={130} cy={92} r={6} fill={on(s.entering > 0)} stroke="var(--border)" />
        <text x={130} y={84} textAnchor="middle" className={label}>
          I0.0
        </text>
        <circle cx={130} cy={150} r={6} fill={on(s.leaving > 0)} stroke="var(--border)" />
        <text x={115} y={154} textAnchor="end" className={label}>
          I0.1
        </text>
        <text
          x={14}
          y={100}
          className="fill-text text-[11px] font-semibold"
          data-testid="plant-waiting"
        >
          {fmt(p.waiting, { n: s.waiting })}
        </text>
        <text
          x={150}
          y={168}
          className="fill-text text-[11px] font-semibold"
          data-testid="plant-parked"
        >
          {fmt(p.parked, { n: s.parked, capacity: PARKING.capacity })}
        </text>
      </svg>
      {s.parked > PARKING.capacity && <Warning text={p.overflow} />}
      {onCommand && (
        <Buttons>
          <CommandButton onClick={() => onCommand('carArrives')}>{p.arrives}</CommandButton>
          <CommandButton disabled={s.parked === 0} onClick={() => onCommand('carLeaves')}>
            {p.leaves}
          </CommandButton>
        </Buttons>
      )}
      <Status
        items={[
          fmt(p.parked, { n: s.parked, capacity: PARKING.capacity }),
          fmt(p.waiting, { n: s.waiting }),
        ]}
      />
    </figure>
  );
}

// ------------------------------------------------------------------------------------- sorter

export function SorterView({ state, out, t }: PlantViewProps) {
  const s = (state as SorterState | null) ?? { pieces: [], next: 0, ok: 0, wrong: 0 };
  const so = t.sorter;
  const x0 = 20;
  const w = 300;
  const beltY = 120;
  const sensorX = beltX(SORTER.sensorAt, x0, w);
  const poleX = sensorX - 16;
  const pistonX = beltX(SORTER.pistonAt, x0, w);
  const atSensor = s.pieces.filter((p) => Math.abs(p.pos - SORTER.sensorAt) <= 3);
  const low = atSensor.length > 0;
  const high = atSensor.some((p) => p.large);
  const piston = out('Q0.1');
  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="sorter">
      <svg viewBox="0 0 380 180" className={svgClass} role="img" aria-label={t.names.sorter}>
        <rect
          x={x0 - 10}
          y={beltY}
          width={w + 20}
          height={14}
          rx={7}
          className="fill-surface-2 stroke-border"
          strokeWidth={2}
        />
        {s.pieces.map((p, i) => {
          const h = p.large ? 34 : 16;
          return (
            <rect
              key={i}
              x={beltX(p.pos, x0, w) - 10}
              y={beltY - h}
              width={20}
              height={h}
              rx={3}
              fill="var(--warning)"
              opacity={0.85}
              stroke="var(--text)"
              strokeWidth={1}
              data-piece={p.large ? 'large' : 'small'}
            />
          );
        })}
        {/* Sensor pole: high sensor on top (I0.3), low sensor below (I0.2) */}
        <line
          x1={poleX}
          y1={beltY - 40}
          x2={poleX}
          y2={beltY}
          className="stroke-border"
          strokeWidth={2}
        />
        <circle
          cx={poleX}
          cy={beltY - 28}
          r={5}
          fill={on(high)}
          stroke="var(--border)"
          data-testid="plant-high-sensor"
          data-on={high}
        />
        <circle
          cx={poleX}
          cy={beltY - 8}
          r={5}
          fill={on(low)}
          stroke="var(--border)"
          data-testid="plant-low-sensor"
          data-on={low}
        />
        <text x={poleX} y={beltY - 46} textAnchor="middle" className={label}>
          I0.3
        </text>
        <text x={poleX} y={beltY + 30} textAnchor="middle" className={label}>
          I0.2
        </text>
        {/* Piston above the belt, pushing large parts into the bin */}
        <rect
          x={pistonX - 14}
          y={30}
          width={28}
          height={22}
          rx={3}
          className="fill-surface-2 stroke-border"
        />
        <rect
          x={pistonX - 4}
          y={52}
          width={8}
          height={piston ? 46 : 14}
          fill="var(--text-muted)"
          data-testid="plant-piston"
          data-on={piston}
        />
        <rect
          x={pistonX - 12}
          y={piston ? 98 : 66}
          width={24}
          height={6}
          rx={2}
          fill="var(--text)"
        />
        <text x={pistonX} y={24} textAnchor="middle" className={label}>
          Q0.1
        </text>
        <text x={pistonX} y={beltY + 48} textAnchor="middle" className={label}>
          ↓ {so.bin}
        </text>
        <text x={x0 + w + 10} y={beltY + 30} textAnchor="end" className={label}>
          {so.end} →
        </text>
        <text
          x={x0}
          y={20}
          className="fill-text text-[11px] font-semibold"
          data-testid="plant-sorted-ok"
        >
          {fmt(so.ok, { n: s.ok })}
        </text>
        <text
          x={x0}
          y={36}
          className="fill-danger text-[11px] font-semibold"
          data-testid="plant-sorted-wrong"
        >
          {fmt(so.wrong, { n: s.wrong })}
        </text>
        <text x={x0} y={beltY + 30} className={label}>
          Q0.0
        </text>
      </svg>
      <Status items={[fmt(so.ok, { n: s.ok }), fmt(so.wrong, { n: s.wrong })]} />
    </figure>
  );
}

// -------------------------------------------------------------------------------------- pumps

export function PumpsView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as PumpsState | null) ?? {
    level: 15,
    consumption: true,
    fault1: false,
    fault2: false,
    run1: 0,
    run2: 0,
  };
  const pu = t.pumps;
  const levelY = (pct: number) => 160 - 1.4 * pct;
  const pumpY = 128;
  const pump = (n: 1 | 2, x: number) => {
    const running = out(n === 1 ? 'Q0.0' : 'Q0.1') && !(n === 1 ? s.fault1 : s.fault2);
    const fault = n === 1 ? s.fault1 : s.fault2;
    const seconds = Math.round((n === 1 ? s.run1 : s.run2) / 1000);
    return (
      <g data-testid={`plant-pump-${n}`} data-on={running} data-fault={fault}>
        <line x1={x} y1={pumpY - 18} x2={x} y2={12} className="stroke-border" strokeWidth={5} />
        <circle
          cx={x}
          cy={pumpY}
          r={18}
          fill={on(running)}
          stroke={fault ? 'var(--danger)' : 'var(--border)'}
          strokeWidth={fault ? 3 : 2}
        />
        <path
          d={`M${x - 6} ${pumpY - 8} L ${x + 8} ${pumpY} L ${x - 6} ${pumpY + 8} Z`}
          fill={running ? 'var(--on-led)' : 'var(--text-muted)'}
        />
        <text x={x} y={pumpY + 34} textAnchor="middle" className={label}>
          {fmt(pu.pump, { n })} · Q0.{n - 1}
        </text>
        <text
          x={x}
          y={pumpY + 48}
          textAnchor="middle"
          className={fault ? 'fill-danger text-[10px] font-semibold' : label}
        >
          {fault ? pu.faulted : fmt(pu.runTime, { s: seconds })}
        </text>
      </g>
    );
  };
  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="pumps">
      <svg viewBox="0 0 440 182" className={svgClass} role="img" aria-label={t.names.pumps}>
        <path d="M40 12 H 250 V 22" className="fill-none stroke-border" strokeWidth={5} />
        {pump(1, 40)}
        {pump(2, 130)}
        <rect
          x={190}
          y={20}
          width={120}
          height={140}
          rx={6}
          className="fill-bg stroke-border"
          strokeWidth={2}
        />
        <rect
          x={192}
          y={levelY(s.level)}
          width={116}
          height={160 - levelY(s.level)}
          rx={4}
          fill="var(--primary)"
          opacity={0.45}
        />
        <text
          x={250}
          y={100}
          textAnchor="middle"
          className="fill-text text-[16px] font-semibold"
          data-testid="plant-level"
        >
          {Math.round(s.level)} %
        </text>
        {[
          [PUMPS.high, 'I0.3'],
          [PUMPS.low, 'I0.2'],
        ].map(([pct, address]) => {
          const covered = s.level >= (pct as number);
          return (
            <g key={address as string}>
              <circle
                cx={324}
                cy={levelY(pct as number)}
                r={6}
                fill={on(covered)}
                stroke="var(--border)"
              />
              <text x={336} y={levelY(pct as number) + 4} className={label}>
                {address}
              </text>
            </g>
          );
        })}
        <path d="M250 160 V 172 H 380" className="fill-none stroke-border" strokeWidth={5} />
        <path
          d="M390 164 L 406 180 L 406 164 L 390 180 Z"
          fill={s.consumption ? 'var(--primary)' : 'var(--surface-2)'}
          stroke="var(--border)"
        />
        <circle
          cx={400}
          cy={30}
          r={11}
          fill={out('Q0.2') ? 'var(--danger)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-alarm"
          data-on={out('Q0.2')}
        />
        <text x={400} y={56} textAnchor="middle" className={label}>
          {pu.alarm}
        </text>
        <text x={400} y={70} textAnchor="middle" className={label}>
          Q0.2
        </text>
      </svg>
      {onCommand && (
        <Buttons>
          {([1, 2] as const).map((n) => {
            const fault = n === 1 ? s.fault1 : s.fault2;
            return (
              <CommandButton
                key={n}
                danger={!fault}
                pressed={fault}
                onClick={() => onCommand(`toggleFault${n}`)}
              >
                {fmt(pu.pump, { n })}: {fault ? pu.repair : pu.fault}
              </CommandButton>
            );
          })}
          <CommandButton pressed={!s.consumption} onClick={() => onCommand('toggleConsumption')}>
            {s.consumption ? t.tank.consumptionOn : t.tank.consumptionOff}
          </CommandButton>
        </Buttons>
      )}
      <Status items={[`${t.tank.level}: ${Math.round(s.level)} %`]} />
    </figure>
  );
}

// --------------------------------------------------------------------------------------- oven

export function OvenView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as OvenState | null) ?? { temp: OVEN.ambient, doorOpen: false };
  const o = t.oven;
  const heater = out('Q0.0');
  const scaleY = (temp: number) =>
    160 - (Math.max(0, Math.min(temp, OVEN.range)) / OVEN.range) * 140;
  const temp = Math.round(s.temp);
  const tx = 290;
  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="oven">
      <svg viewBox="0 0 380 180" className={svgClass} role="img" aria-label={t.names.oven}>
        {/* Oven body and door */}
        <rect
          x={30}
          y={20}
          width={180}
          height={140}
          rx={10}
          className="fill-surface-2 stroke-border"
          strokeWidth={2}
        />
        <rect x={46} y={36} width={148} height={96} rx={6} className="fill-bg stroke-border" />
        {s.doorOpen ? (
          <rect
            x={46}
            y={132}
            width={148}
            height={34}
            rx={4}
            className="fill-surface stroke-border"
          />
        ) : (
          <line x1={46} y1={132} x2={194} y2={132} className="stroke-border" strokeWidth={3} />
        )}
        {/* Heating element */}
        <path
          d="M60 112 q 10 -16 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0"
          fill="none"
          stroke={heater ? 'var(--warning)' : 'var(--border)'}
          strokeWidth={4}
          strokeLinecap="round"
          data-testid="plant-heater"
          data-on={heater}
        />
        <text
          x={120}
          y={64}
          textAnchor="middle"
          className="fill-text text-[22px] font-semibold"
          data-testid="plant-temp"
        >
          {temp} °C
        </text>
        <text x={120} y={152} textAnchor="middle" className={label}>
          Q0.0 · {o.heater}
        </text>
        {/* Thermometer 0–300 °C with the control band */}
        <rect
          x={tx - 10}
          y={20}
          width={20}
          height={140}
          rx={10}
          className="fill-bg stroke-border"
        />
        <rect
          x={tx - 8}
          y={scaleY(s.temp)}
          width={16}
          height={160 - scaleY(s.temp)}
          rx={8}
          fill="var(--warning)"
          opacity={0.8}
        />
        <rect
          x={tx - 16}
          y={scaleY(185)}
          width={32}
          height={scaleY(175) - scaleY(185)}
          fill="var(--primary)"
          opacity={0.3}
        />
        {[0, 100, 200, 300].map((v) => (
          <text key={v} x={tx + 18} y={scaleY(v) + 4} className={label}>
            {v}
          </text>
        ))}
        <text
          x={tx - 20}
          y={scaleY(180) + 4}
          textAnchor="end"
          className="fill-primary text-[10px] font-semibold"
        >
          175–185 °C
        </text>
        <text x={tx} y={176} textAnchor="middle" className={label}>
          IW0
        </text>
      </svg>
      {onCommand && (
        <Buttons>
          <CommandButton pressed={s.doorOpen} onClick={() => onCommand('toggleDoor')}>
            {s.doorOpen ? o.closeDoor : o.openDoor}
          </CommandButton>
        </Buttons>
      )}
      <Status items={[`${o.temperature}: ${temp} °C`]} />
    </figure>
  );
}

// ----------------------------------------------------------------------------- level control

export function LevelControlView({ state, word, t, onCommand }: PlantViewProps) {
  const s = (state as LevelControlState | null) ?? { level: 20, consumption: true };
  const lc = t.levelControl;
  const opening = Math.max(0, Math.min(1, (word?.('QW0') ?? 0) / ANALOG_FULL_SCALE));
  const levelY = (pct: number) => 160 - 1.4 * pct;
  const level = Math.round(s.level);
  const surface = Math.max(42, levelY(s.level));
  return (
    <figure
      className="flex h-full flex-col items-center justify-center gap-2"
      data-plant="levelControl"
    >
      <svg viewBox="0 0 400 180" className={svgClass} role="img" aria-label={t.names.levelControl}>
        {/* Inlet with proportional valve */}
        <path d="M20 26 H 110" className="fill-none stroke-border" strokeWidth={6} />
        <path
          d="M110 18 L 130 34 L 130 18 L 110 34 Z"
          fill={opening > 0 ? 'var(--primary)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-valve"
          data-opening={Math.round(opening * 100)}
        />
        <text x={20} y={52} className={label}>
          QW0 · {lc.valve}
        </text>
        <text x={20} y={68} className="fill-text text-[12px] font-semibold">
          {Math.round(opening * 100)} %
        </text>
        <path d="M130 26 H 200 V 40" className="fill-none stroke-border" strokeWidth={6} />
        {/* Tank */}
        <rect
          x={140}
          y={40}
          width={120}
          height={120}
          rx={6}
          className="fill-bg stroke-border"
          strokeWidth={2}
        />
        {opening > 0 && (
          <rect
            x={200 - 1 - opening * 4}
            y={42}
            width={2 + opening * 8}
            height={Math.max(0, surface - 42)}
            fill="var(--primary)"
            opacity={0.6}
          />
        )}
        <rect
          x={142}
          y={surface}
          width={116}
          height={160 - surface}
          rx={4}
          fill="var(--primary)"
          opacity={0.45}
        />
        <line
          x1={136}
          x2={264}
          y1={levelY(60)}
          y2={levelY(60)}
          stroke="var(--primary)"
          strokeDasharray="5 4"
          strokeWidth={2}
        />
        <text x={270} y={levelY(60) + 4} className="fill-primary text-[11px] font-semibold">
          {lc.setpoint} 60 %
        </text>
        <text
          x={200}
          y={118}
          textAnchor="middle"
          className="fill-text text-[16px] font-semibold"
          data-testid="plant-level"
        >
          {level} %
        </text>
        <text x={270} y={150} className={label}>
          IW0
        </text>
        {/* Outlet */}
        <path d="M200 160 V 172 H 330" className="fill-none stroke-border" strokeWidth={5} />
        <path
          d="M340 164 L 356 180 L 356 164 L 340 180 Z"
          fill={s.consumption ? 'var(--primary)' : 'var(--surface-2)'}
          stroke="var(--border)"
        />
      </svg>
      {onCommand && (
        <Buttons>
          <CommandButton pressed={!s.consumption} onClick={() => onCommand('toggleConsumption')}>
            {s.consumption ? t.tank.consumptionOn : t.tank.consumptionOff}
          </CommandButton>
        </Buttons>
      )}
      <Status
        items={[`${t.tank.level}: ${level} %`, `${lc.valve}: ${Math.round(opening * 100)} %`]}
      />
    </figure>
  );
}
