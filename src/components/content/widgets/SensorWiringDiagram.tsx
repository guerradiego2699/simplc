import { useState } from 'react';
import type { Dictionary } from '@/i18n';

type Strings = Dictionary['widgets']['sensor'];
export type SensorType = 'pnp' | 'npn';

/**
 * Current path (in the direction of conventional current) for each sensor type when the
 * sensor detects an object. Drawn as an animated dashed overlay over the static wiring.
 */
export const CURRENT_PATH: Record<SensorType, string> = {
  // + → brown → switch → black → I0.0 → input circuit → COM → 0 V → −
  pnp: 'M40 120 V40 H160 V118 H200 L240 150 H380 H450 V210 H380 H330 V260 H40 V180',
  // + → COM → input circuit → I0.0 → black → switch → blue → 0 V → −
  npn: 'M40 120 V40 H330 V210 H380 H450 V150 H380 H240 L200 182 H160 V260 H40 V180',
};

/** Where the module common must be wired for each sensor type. */
export const COM_WIRE: Record<SensorType, string> = {
  pnp: 'M380 210 H330 V260',
  npn: 'M380 210 H330 V40',
};

const wire = { fill: 'none', stroke: 'var(--wire-off)', strokeWidth: 2 } as const;
const label = { fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--ff-mono)' } as const;

export default function SensorWiringDiagram({ strings }: { strings: Strings }) {
  const [type, setType] = useState<SensorType>('pnp');
  const [detected, setDetected] = useState(false);

  // Blade pivots at the output node; it swings to +24 V (PNP) or 0 V (NPN) when closed.
  const bladeTarget = type === 'pnp' ? { x: 200, y: 118 } : { x: 200, y: 182 };
  const bladeAngle = detected ? 0 : type === 'pnp' ? -28 : 28;
  const diodeDown = type === 'pnp';

  return (
    <figure className="not-prose my-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{strings.sensorType}</span>
          <div
            role="group"
            aria-label={strings.sensorType}
            className="inline-flex rounded-md border border-border bg-bg p-0.5"
          >
            {(['pnp', 'npn'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className="h-8 rounded px-3 font-mono text-sm font-semibold text-text-muted uppercase aria-pressed:bg-primary aria-pressed:text-on-primary"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <button
            type="button"
            role="switch"
            aria-checked={detected}
            onClick={() => setDetected((d) => !d)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              detected ? 'bg-primary' : 'bg-wire-off'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-bg shadow transition-transform ${
                detected ? 'translate-x-5' : ''
              }`}
            />
          </button>
          <span>{strings.object}</span>
        </label>
      </div>

      <svg
        viewBox="0 0 620 290"
        role="img"
        aria-label={strings.label}
        className="mt-4 h-auto w-full rounded-md bg-bg"
      >
        {/* Supply */}
        <rect
          x="16"
          y="120"
          width="48"
          height="60"
          rx="4"
          fill="var(--surface)"
          stroke="var(--text-muted)"
        />
        <text x="40" y="146" textAnchor="middle" {...label} fill="var(--text)">
          +
        </text>
        <text x="40" y="170" textAnchor="middle" {...label} fill="var(--text)">
          −
        </text>
        <text x="40" y="198" textAnchor="middle" {...label} fontSize={10}>
          24 VDC
        </text>
        <text x="72" y="32" {...label}>
          +24 V
        </text>
        <text x="72" y="280" {...label}>
          0 V
        </text>

        {/* Rails */}
        <path d="M40 120 V40 H340" {...wire} />
        <path d="M40 180 V260 H340" {...wire} />

        {/* Sensor (3-wire) */}
        <rect
          x="130"
          y="100"
          width="120"
          height="100"
          rx="8"
          fill="var(--surface)"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
        />
        <text x="212" y="220" textAnchor="middle" fontSize="12" fill="var(--text)">
          {strings.sensor} {type.toUpperCase()}
        </text>
        <path d="M160 40 V118 H200" {...wire} />
        <path d="M160 260 V182 H200" {...wire} />
        <path d="M240 150 H380" {...wire} />
        <text x="166" y="76" {...label}>
          BN
        </text>
        <text x="166" y="236" {...label}>
          BU
        </text>
        <text x="300" y="142" {...label}>
          BK
        </text>
        <circle cx="200" cy="118" r="3" fill="var(--text-muted)" />
        <circle cx="200" cy="182" r="3" fill="var(--text-muted)" />
        <circle cx="240" cy="150" r="3" fill="var(--text-muted)" />
        <line
          x1="240"
          y1="150"
          x2={bladeTarget.x}
          y2={bladeTarget.y}
          stroke={detected ? 'var(--wire-on)' : 'var(--text)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${bladeAngle} 240 150)`}
          style={{ transition: 'transform 150ms' }}
        />
        {/* Sensing face and target object */}
        <path
          d="M130 130 q -8 20 0 40"
          fill="none"
          stroke="var(--text-muted)"
          strokeDasharray="3 3"
        />
        {detected && (
          <rect x="88" y="128" width="28" height="44" rx="3" fill="var(--primary)" opacity="0.85" />
        )}

        {/* Input module */}
        <rect
          x="380"
          y="90"
          width="220"
          height="150"
          rx="8"
          fill="var(--surface)"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
        />
        <text x="490" y="110" textAnchor="middle" fontSize="12" fill="var(--text)">
          {strings.inputModule}
        </text>
        <text x="388" y="142" {...label} fill="var(--text)">
          I0.0
        </text>
        <text x="388" y="228" {...label} fill="var(--text)">
          COM
        </text>
        <path d="M380 150 H450 V210 H380" {...wire} />
        <circle cx="380" cy="150" r="4" fill="var(--bg)" stroke="var(--text)" />
        <circle cx="380" cy="210" r="4" fill="var(--bg)" stroke="var(--text)" />
        {/* Optocoupler LED (arrow shows conduction direction) */}
        <rect x="438" y="166" width="24" height="28" fill="var(--surface)" />
        <path
          d={
            diodeDown
              ? 'M440 170 H460 L450 188 Z M440 190 H460'
              : 'M440 190 H460 L450 172 Z M440 170 H460'
          }
          fill={detected ? 'var(--wire-on)' : 'none'}
          stroke={detected ? 'var(--wire-on)' : 'var(--text-muted)'}
          strokeWidth="1.5"
        />
        {/* Front status LED */}
        <circle
          cx="540"
          cy="160"
          r="9"
          fill={detected ? 'var(--led-on)' : 'var(--surface-2)'}
          stroke="var(--border)"
        />
        <text x="540" y="188" textAnchor="middle" {...label}>
          I0.0 = {detected ? 1 : 0}
        </text>

        {/* Common, wired according to the sensor type */}
        <path d={COM_WIRE[type]} {...wire} stroke="var(--text)" />

        {/* Animated current */}
        {detected && (
          <path
            d={CURRENT_PATH[type]}
            fill="none"
            stroke="var(--wire-on)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeDasharray="10 8"
            className="current-flow"
          />
        )}
      </svg>

      <figcaption className="mt-4 space-y-1 text-sm text-text-muted">
        <p className="font-medium text-text">{type === 'pnp' ? strings.pnpCom : strings.npnCom}</p>
        <p aria-live="polite">
          {detected ? (type === 'pnp' ? strings.pnpOn : strings.npnOn) : strings.off}
        </p>
        <p className="font-mono text-xs">{strings.legend}</p>
      </figcaption>

      <style>{`
        .current-flow { animation: current-flow 0.9s linear infinite; }
        @keyframes current-flow { to { stroke-dashoffset: -18; } }
        @media (prefers-reduced-motion: reduce) { .current-flow { animation: none; } }
      `}</style>
    </figure>
  );
}
