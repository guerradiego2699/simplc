import { useId, useState } from 'react';
import type { Dictionary } from '@/i18n';

type Strings = Dictionary['widgets']['analog'];

/** Live-zero current signal: 0 % → 4 mA, 100 % → 20 mA. */
export function levelToMilliamps(percent: number): number {
  return 4 + (16 * percent) / 100;
}

/** 0 % → 0 V, 100 % → 10 V. */
export function levelToVolts(percent: number): number {
  return (10 * percent) / 100;
}

/** Below ~3.6 mA a 4–20 mA loop is considered faulty (e.g. broken wire). */
export function isCurrentFault(mA: number): boolean {
  return mA < 3.6 || mA > 21;
}

function Meter({
  title,
  value,
  unit,
  max,
  fault,
  message,
}: {
  title: string;
  value: number;
  unit: string;
  max: number;
  fault: boolean;
  message: string;
}) {
  return (
    <div className={`bg-bg rounded-md border p-3 ${fault ? 'border-danger' : 'border-border'}`}>
      <p className="text-text-muted text-xs">{title}</p>
      <p className="text-text mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value.toFixed(1)} <span className="text-text-muted text-base">{unit}</span>
      </p>
      <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <p className={`mt-2 text-xs ${fault ? 'text-danger font-medium' : 'text-text-muted'}`}>
        {message}
      </p>
    </div>
  );
}

export default function AnalogSignalDemo({ strings }: { strings: Strings }) {
  const [level, setLevel] = useState(60);
  const [broken, setBroken] = useState(false);
  const sliderId = useId();

  const mA = broken ? 0 : levelToMilliamps(level);
  const volts = broken ? 0 : levelToVolts(level);
  const currentFault = isCurrentFault(mA);

  return (
    <figure
      className="not-prose border-border bg-surface my-8 rounded-lg border p-4 sm:p-6"
      aria-label={strings.label}
    >
      <div className="grid gap-6 sm:grid-cols-[120px_1fr]">
        {/* Tank */}
        <svg viewBox="0 0 120 160" className="mx-auto w-28 sm:w-full" aria-hidden="true">
          <rect
            x="20"
            y="10"
            width="80"
            height="140"
            rx="6"
            fill="var(--bg)"
            stroke="var(--text-muted)"
            strokeWidth="2"
          />
          <rect
            x="22"
            y={12 + (136 * (100 - level)) / 100}
            width="76"
            height={(136 * level) / 100}
            rx="4"
            fill="var(--primary)"
            opacity="0.35"
          />
          {[25, 50, 75].map((p) => (
            <line
              key={p}
              x1="92"
              x2="100"
              y1={12 + (136 * (100 - p)) / 100}
              y2={12 + (136 * (100 - p)) / 100}
              stroke="var(--text-muted)"
            />
          ))}
          <text
            x="60"
            y="84"
            textAnchor="middle"
            fontFamily="var(--ff-mono)"
            fontSize="16"
            fontWeight="600"
            fill="var(--text)"
          >
            {level}%
          </text>
        </svg>

        <div>
          <label htmlFor={sliderId} className="text-text text-sm font-medium">
            {strings.level}: <span className="font-mono">{level}%</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meter
              title={strings.current}
              value={mA}
              unit="mA"
              max={20}
              fault={currentFault}
              message={currentFault ? strings.currentFault : strings.ok}
            />
            <Meter
              title={strings.voltage}
              value={volts}
              unit="V"
              max={10}
              fault={false}
              message={broken ? strings.voltageFault : strings.ok}
            />
          </div>

          <label className="text-text mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={broken}
              onChange={(e) => setBroken(e.target.checked)}
              className="size-4 accent-[var(--danger)]"
            />
            {strings.wireBreak}
          </label>
        </div>
      </div>
    </figure>
  );
}
