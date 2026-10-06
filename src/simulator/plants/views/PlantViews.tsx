/**
 * Animated SVG views of the virtual plants (spec 6.7). Presentational only: they receive the
 * plant state, the physical outputs and the strings, so they work in the simulator and, at
 * rest, on the example pages (server-rendered, no store).
 *
 * Colours come from tokens. Green (--led-on) is used only for signals that are logically
 * active (an energized output, a sensor that is on).
 */
import { label, Status, svgClass, usePrefersReducedMotion, useRotorAngle } from './shared';
import type { Dictionary } from '@/i18n';
import type { PlantId } from '@/simulator/plants/types';
import { TANK, type MotorState, type TankState } from '@/simulator/plants/models';
import {
  ConveyorView,
  GateView,
  LevelControlView,
  OvenView,
  ParkingView,
  PumpsView,
  ReversingView,
  SorterView,
  StarDeltaView,
} from './PlantViewsII';

export type PlantStrings = Dictionary['simulator']['plant'];

export interface PlantViewProps {
  plant: PlantId;
  /** Plant state (null = initial state / at rest). */
  state: unknown;
  /** Physical output of the PLC. */
  out: (address: string) => boolean;
  /** Analog output of the PLC (QW0…), raw value. */
  word?: (address: string) => number;
  t: PlantStrings;
  /** Operator actions; omitted on static previews. */
  onCommand?: (name: string) => void;
}

export function PlantView(props: PlantViewProps) {
  switch (props.plant) {
    case 'lamp':
      return <LampView {...props} />;
    case 'motor':
      return <MotorView {...props} />;
    case 'traffic':
      return <TrafficView {...props} />;
    case 'tank':
      return <TankView {...props} />;
    case 'reversing':
      return <ReversingView {...props} />;
    case 'gate':
      return <GateView {...props} />;
    case 'starDelta':
      return <StarDeltaView {...props} />;
    case 'conveyor':
      return <ConveyorView {...props} />;
    case 'parking':
      return <ParkingView {...props} />;
    case 'sorter':
      return <SorterView {...props} />;
    case 'pumps':
      return <PumpsView {...props} />;
    case 'oven':
      return <OvenView {...props} />;
    case 'levelControl':
      return <LevelControlView {...props} />;
  }
}

// ---------------------------------------------------------------------------------------------

function LampView({ out, t }: PlantViewProps) {
  const on = out('Q0.0');
  return (
    <figure className="flex h-full flex-col items-center justify-center" data-plant="lamp">
      <svg viewBox="0 0 200 180" className={svgClass} role="img" aria-label={t.names.lamp}>
        <line x1="100" y1="0" x2="100" y2="38" className="stroke-wire-off" strokeWidth="2" />
        <rect
          x="88"
          y="38"
          width="24"
          height="18"
          rx="3"
          className="fill-surface-2 stroke-border"
        />
        {on && <circle cx="100" cy="92" r="56" fill="var(--warning)" opacity="0.18" />}
        <path
          d="M100 56 C 70 56 62 82 72 100 C 78 110 84 116 84 128 L 116 128 C 116 116 122 110 128 100 C 138 82 130 56 100 56 Z"
          fill={on ? 'var(--warning)' : 'var(--surface-2)'}
          stroke={on ? 'var(--warning)' : 'var(--border)'}
          strokeWidth="2"
          data-on={on}
          data-testid="plant-lamp-bulb"
        />
        <rect x="86" y="130" width="28" height="12" rx="2" className="fill-wire-off" />
        <text x="100" y="166" textAnchor="middle" className={label}>
          Q0.0 · {on ? t.lamp.on : t.lamp.off}
        </text>
      </svg>
      <Status items={[on ? t.lamp.on : t.lamp.off]} />
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------

function MotorView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as MotorState | null) ?? { speed: 0, tripped: false };
  const contactor = out('Q0.0');
  const reduced = usePrefersReducedMotion();
  const angle = useRotorAngle(s.speed, !reduced && onCommand !== undefined);
  const percent = Math.round(s.speed * 100);
  const contactorText = `${t.motor.contactor}: ${contactor ? t.motor.energized : t.motor.released}`;
  const relayText = `${t.motor.relay}: ${s.tripped ? t.motor.tripped : t.motor.ok}`;

  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="motor">
      <svg viewBox="0 0 360 180" className={svgClass} role="img" aria-label={t.names.motor}>
        {/* Contactor K1 */}
        <rect
          x="16"
          y="30"
          width="84"
          height="50"
          rx="6"
          fill={contactor ? 'var(--led-on)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-contactor"
          data-on={contactor}
        />
        <text
          x="58"
          y="60"
          textAnchor="middle"
          className="text-[13px] font-semibold"
          fill={contactor ? 'var(--on-led)' : 'var(--text)'}
        >
          K1
        </text>
        <text x="58" y="98" textAnchor="middle" className={label}>
          Q0.0
        </text>
        {/* Overload relay */}
        <rect
          x="16"
          y="112"
          width="84"
          height="34"
          rx="6"
          fill={s.tripped ? 'var(--danger)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-relay"
          data-tripped={s.tripped}
        />
        <text
          x="58"
          y="134"
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill={s.tripped ? 'var(--on-danger)' : 'var(--text)'}
        >
          F1 · I0.2
        </text>
        {/* Power line to the motor */}
        <path
          d="M100 55 H 170"
          stroke={contactor && !s.tripped ? 'var(--wire-on)' : 'var(--wire-off)'}
          strokeWidth="3"
        />
        {/* Motor */}
        <rect
          x="170"
          y="30"
          width="110"
          height="110"
          rx="14"
          className="fill-surface-2 stroke-border"
          strokeWidth="2"
        />
        <circle cx="225" cy="85" r="40" className="fill-bg stroke-border" strokeWidth="2" />
        <g transform={`rotate(${angle} 225 85)`} data-testid="plant-rotor">
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d="M225 85 L 225 52 A 10 10 0 0 1 238 60 Z"
              transform={`rotate(${a} 225 85)`}
              fill="var(--primary)"
              opacity="0.8"
            />
          ))}
          <circle cx="225" cy="85" r="6" fill="var(--text-muted)" />
        </g>
        <text x="225" y="160" textAnchor="middle" className={label}>
          M 3~
        </text>
        {/* Speed bar */}
        <rect
          x="300"
          y="30"
          width="16"
          height="110"
          rx="4"
          className="fill-surface-2 stroke-border"
        />
        <rect
          x="300"
          y={30 + 110 * (1 - s.speed)}
          width="16"
          height={110 * s.speed}
          rx="4"
          fill="var(--primary)"
        />
        <text x="308" y="160" textAnchor="middle" className={label} data-testid="plant-speed">
          {percent} %
        </text>
      </svg>
      {onCommand && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCommand('overload')}
            disabled={s.tripped}
            className="rounded-md border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-on-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-danger"
          >
            {t.motor.overload}
          </button>
          <button
            type="button"
            onClick={() => onCommand('resetOverload')}
            disabled={!s.tripped}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {t.motor.reset}
          </button>
        </div>
      )}
      <Status items={[contactorText, relayText, `${t.motor.speed}: ${percent} %`]} />
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------

const LIGHTS = [
  { key: 'red', color: 'var(--danger)' },
  { key: 'amber', color: 'var(--warning)' },
  { key: 'green', color: 'var(--led-on)' },
] as const;

function TrafficHead({
  x,
  title,
  addresses,
  out,
  t,
  id,
}: {
  x: number;
  title: string;
  addresses: [string, string, string];
  out: (a: string) => boolean;
  t: PlantStrings;
  id: string;
}) {
  return (
    <g>
      <rect x={x} y="14" width="48" height="132" rx="10" fill="var(--text)" opacity="0.85" />
      {LIGHTS.map((light, i) => {
        const address = addresses[i]!;
        const on = out(address);
        return (
          <g key={light.key}>
            {on && <circle cx={x + 24} cy={38 + i * 42} r="22" fill={light.color} opacity="0.25" />}
            <circle
              cx={x + 24}
              cy={38 + i * 42}
              r="15"
              fill={on ? light.color : 'var(--surface-2)'}
              opacity={on ? 1 : 0.35}
              data-testid={`plant-light-${id}-${light.key}`}
              data-on={on}
            >
              <title>{`${address} · ${t.traffic[light.key]}`}</title>
            </circle>
          </g>
        );
      })}
      <text x={x + 24} y="166" textAnchor="middle" className={label}>
        {title}
      </text>
    </g>
  );
}

function TrafficView({ out, t }: PlantViewProps) {
  const describe = (addresses: string[]) =>
    LIGHTS.filter((_, i) => out(addresses[i]!))
      .map((l) => t.traffic[l.key])
      .join(', ') || t.traffic.off;
  return (
    <figure className="flex h-full flex-col items-center justify-center" data-plant="traffic">
      <svg viewBox="0 0 300 180" className={svgClass} role="img" aria-label={t.names.traffic}>
        {/* Crossroad */}
        <rect x="0" y="70" width="300" height="36" className="fill-surface-2" />
        <rect x="132" y="0" width="36" height="180" className="fill-surface-2" />
        <TrafficHead
          x={50}
          title={t.traffic.streetA}
          addresses={['Q0.0', 'Q0.1', 'Q0.2']}
          out={out}
          t={t}
          id="a"
        />
        <TrafficHead
          x={202}
          title={t.traffic.streetB}
          addresses={['Q0.3', 'Q0.4', 'Q0.5']}
          out={out}
          t={t}
          id="b"
        />
      </svg>
      <Status
        items={[
          `${t.traffic.streetA}: ${describe(['Q0.0', 'Q0.1', 'Q0.2'])}`,
          `${t.traffic.streetB}: ${describe(['Q0.3', 'Q0.4', 'Q0.5'])}`,
        ]}
      />
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------

function TankView({ state, out, t, onCommand }: PlantViewProps) {
  const s = (state as TankState | null) ?? { level: 10, consumption: true };
  const pump = out('Q0.0');
  const low = s.level >= TANK.low;
  const high = s.level >= TANK.high;
  // Tank interior: y 20…160 (140 px = 100 %).
  const levelY = (pct: number) => 160 - 1.4 * pct;
  const level = Math.round(s.level);

  const sensor = (pct: number, on: boolean, name: string, address: string, id: string) => (
    <g>
      <line
        x1="262"
        y1={levelY(pct)}
        x2="278"
        y2={levelY(pct)}
        className="stroke-border"
        strokeWidth="2"
      />
      <circle
        cx="284"
        cy={levelY(pct)}
        r="6"
        fill={on ? 'var(--led-on)' : 'var(--surface-2)'}
        stroke="var(--border)"
        data-testid={`plant-sensor-${id}`}
        data-on={on}
      />
      <text x="296" y={levelY(pct) + 4} className={label}>
        {address} · {name}
      </text>
    </g>
  );

  return (
    <figure className="flex h-full flex-col items-center justify-center gap-2" data-plant="tank">
      <svg viewBox="0 0 400 180" className={svgClass} role="img" aria-label={t.names.tank}>
        {/* Pump and inlet pipe */}
        <path d="M20 150 H 70" className="stroke-border" strokeWidth="6" />
        <circle
          cx="90"
          cy="150"
          r="20"
          fill={pump ? 'var(--led-on)' : 'var(--surface-2)'}
          stroke="var(--border)"
          strokeWidth="2"
          data-testid="plant-pump"
          data-on={pump}
        />
        <path
          d="M82 140 L 102 150 L 82 160 Z"
          fill={pump ? 'var(--on-led)' : 'var(--text-muted)'}
        />
        <text x="90" y="118" textAnchor="middle" className={label}>
          Q0.0 · {t.tank.pump}
        </text>
        <path
          d="M110 150 H 130 V 12 H 190 V 26"
          className="fill-none stroke-border"
          strokeWidth="6"
        />
        {pump && s.level < 100 && (
          <rect
            x="187"
            y="26"
            width="6"
            height={Math.max(0, levelY(s.level) - 26)}
            fill="var(--primary)"
            opacity="0.6"
          />
        )}
        {/* Tank */}
        <rect
          x="140"
          y="20"
          width="120"
          height="140"
          rx="6"
          className="fill-bg stroke-border"
          strokeWidth="2"
        />
        <rect
          x="142"
          y={levelY(s.level)}
          width="116"
          height={160 - levelY(s.level)}
          rx="4"
          fill="var(--primary)"
          opacity="0.45"
          data-testid="plant-water"
        />
        <text
          x="200"
          y="100"
          textAnchor="middle"
          className="fill-text text-[16px] font-semibold"
          data-testid="plant-level"
        >
          {level} %
        </text>
        {sensor(TANK.high, high, t.tank.high, 'I0.3', 'high')}
        {sensor(TANK.low, low, t.tank.low, 'I0.2', 'low')}
        {/* Outlet with consumer valve */}
        <path d="M200 160 V 172 H 320" className="fill-none stroke-border" strokeWidth="6" />
        <path
          d="M330 164 L 346 180 L 346 164 L 330 180 Z"
          fill={s.consumption ? 'var(--primary)' : 'var(--surface-2)'}
          stroke="var(--border)"
          data-testid="plant-valve"
          data-open={s.consumption}
        />
      </svg>
      {onCommand && (
        <button
          type="button"
          aria-pressed={!s.consumption}
          onClick={() => onCommand('toggleConsumption')}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-2"
        >
          {s.consumption ? t.tank.consumptionOn : t.tank.consumptionOff}
        </button>
      )}
      <Status
        items={[
          `${t.tank.level}: ${level} %`,
          `${t.tank.pump}: ${pump ? t.tank.running : t.tank.stopped}`,
          `${t.tank.low}: ${low ? t.tank.covered : t.tank.uncovered}`,
          `${t.tank.high}: ${high ? t.tank.covered : t.tank.uncovered}`,
          `${t.tank.consumption}: ${s.consumption ? t.tank.open : t.tank.closed}`,
        ]}
      />
    </figure>
  );
}
