import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Dictionary } from '@/i18n';

type Strings = Dictionary['widgets']['terminals'];

/** Clickable parts of the drawing, in reading order (also the keyboard tab order). */
export const PARTS = [
  'power',
  'pe',
  'inputCommon',
  'inputs',
  'statusLeds',
  'modeSwitch',
  'ioLeds',
  'ethernet',
  'rs485',
  'usb',
  'sdCard',
  'expansion',
  'outputCommon',
  'outputs',
  'dinRail',
] as const;
export type Part = (typeof PARTS)[number];

/** Top strip: supply, earth, input common and inputs. Bottom strip: output commons and outputs. */
export const TOP_TERMINALS: { label: string; part: Part }[] = [
  { label: 'L+', part: 'power' },
  { label: 'M', part: 'power' },
  { label: 'PE', part: 'pe' },
  { label: '1M', part: 'inputCommon' },
  ...Array.from({ length: 8 }, (_, i) => ({ label: `I0.${i}`, part: 'inputs' as Part })),
];
export const BOTTOM_TERMINALS: { label: string; part: Part }[] = [
  { label: '1L', part: 'outputCommon' },
  { label: 'Q0.0', part: 'outputs' },
  { label: 'Q0.1', part: 'outputs' },
  { label: 'Q0.2', part: 'outputs' },
  { label: '2L', part: 'outputCommon' },
  { label: 'Q0.3', part: 'outputs' },
  { label: 'Q0.4', part: 'outputs' },
  { label: 'Q0.5', part: 'outputs' },
];

// Labels are drawn for sighted users; each part's accessible name already includes them.
const mono = {
  fontFamily: 'var(--ff-mono)',
  fontSize: 11,
  fill: 'var(--text-muted)',
  'aria-hidden': true,
} as const;
const TERM_X0 = 84;
const TERM_DX = 38;

/** A clickable, focusable group of the drawing. */
function Hot({
  part,
  terminal,
  selected,
  onSelect,
  strings,
  children,
}: {
  part: Part;
  /** Terminal marking, read before the part name (e.g. "Q0.0: Digital outputs…"). */
  terminal?: string;
  selected: Part | null;
  onSelect: (part: Part) => void;
  strings: Strings;
  children: ReactNode;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected === part}
      aria-label={terminal ? `${terminal}: ${strings.parts[part].name}` : strings.parts[part].name}
      data-part={part}
      className="cursor-pointer outline-none [&:focus-visible_.hot]:stroke-primary"
      onClick={() => onSelect(part)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(part);
        }
      }}
    >
      {children}
    </g>
  );
}

export default function TerminalDiagram({ strings }: { strings: Strings }) {
  const [selected, setSelected] = useState<Part | null>(null);
  const active = (part: Part) => selected === part;
  const stroke = (part: Part) => (active(part) ? 'var(--primary)' : 'var(--border)');

  const hot = { selected, onSelect: setSelected, strings };

  const terminal = (label: string, part: Part, x: number, y: number, labelBelow: boolean) => (
    <Hot key={`${label}-${x}-${y}`} part={part} terminal={label} {...hot}>
      <rect
        className="hot"
        x={x}
        y={y}
        width={30}
        height={24}
        rx={3}
        fill={active(part) ? 'color-mix(in srgb, var(--primary) 15%, var(--bg))' : 'var(--bg)'}
        stroke={stroke(part)}
        strokeWidth={active(part) ? 2 : 1}
      />
      <circle cx={x + 15} cy={y + 12} r={6} fill="none" stroke="var(--text-muted)" />
      <line x1={x + 11} y1={y + 12} x2={x + 19} y2={y + 12} stroke="var(--text-muted)" />
      <text x={x + 15} y={labelBelow ? y + 37 : y - 6} textAnchor="middle" {...mono}>
        {label}
      </text>
    </Hot>
  );

  const info = selected ? strings.parts[selected] : null;

  return (
    <figure className="not-prose my-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <p className="mb-3 text-sm text-text-muted">{strings.hint}</p>
      <div className="flex flex-col gap-4">
        <svg
          viewBox="0 0 640 340"
          className="h-auto w-full"
          role="group"
          aria-label={strings.title}
          data-testid="terminal-diagram"
        >
          {/* DIN rail */}
          <Hot part="dinRail" {...hot}>
            <rect
              className="hot"
              x={20}
              y={296}
              width={600}
              height={14}
              rx={2}
              fill="var(--surface-2)"
              stroke={stroke('dinRail')}
              strokeWidth={active('dinRail') ? 2 : 1}
            />
            {Array.from({ length: 15 }, (_, i) => (
              <rect
                key={i}
                x={34 + i * 40}
                y={300}
                width={18}
                height={6}
                rx={1}
                fill="var(--border)"
              />
            ))}
          </Hot>

          {/* Body */}
          <rect
            x={60}
            y={40}
            width={520}
            height={250}
            rx={10}
            fill="var(--surface-2)"
            stroke="var(--border)"
          />

          {TOP_TERMINALS.map((t, i) => terminal(t.label, t.part, TERM_X0 + i * TERM_DX, 52, true))}
          {BOTTOM_TERMINALS.map((t, i) =>
            terminal(t.label, t.part, TERM_X0 + i * TERM_DX, 254, false),
          )}

          {/* Status LEDs */}
          <Hot part="statusLeds" {...hot}>
            <rect
              className="hot"
              x={78}
              y={118}
              width={80}
              height={64}
              rx={6}
              fill="transparent"
              stroke={stroke('statusLeds')}
              strokeWidth={active('statusLeds') ? 2 : 1}
            />
            {['RUN', 'STOP', 'ERROR'].map((name, i) => (
              <g key={name}>
                <circle
                  cx={92}
                  cy={132 + i * 18}
                  r={5}
                  fill={i === 0 ? 'var(--led-on)' : 'var(--bg)'}
                  stroke="var(--border)"
                />
                <text x={104} y={136 + i * 18} {...mono}>
                  {name}
                </text>
              </g>
            ))}
          </Hot>

          {/* Mode switch */}
          <Hot part="modeSwitch" {...hot}>
            <rect
              className="hot"
              x={78}
              y={192}
              width={80}
              height={30}
              rx={6}
              fill="transparent"
              stroke={stroke('modeSwitch')}
              strokeWidth={active('modeSwitch') ? 2 : 1}
            />
            <rect
              x={88}
              y={201}
              width={28}
              height={12}
              rx={6}
              fill="var(--bg)"
              stroke="var(--text-muted)"
            />
            <circle cx={95} cy={207} r={4} fill="var(--text-muted)" />
            <text x={122} y={211} {...mono}>
              RUN/STOP
            </text>
          </Hot>

          {/* I/O LEDs */}
          <Hot part="ioLeds" {...hot}>
            <rect
              className="hot"
              x={172}
              y={118}
              width={176}
              height={104}
              rx={6}
              fill="transparent"
              stroke={stroke('ioLeds')}
              strokeWidth={active('ioLeds') ? 2 : 1}
            />
            <text x={182} y={136} {...mono}>
              IN
            </text>
            <text x={182} y={206} {...mono}>
              OUT
            </text>
            {Array.from({ length: 8 }, (_, i) => (
              <circle
                key={`i${i}`}
                cx={214 + i * 16}
                cy={150}
                r={4.5}
                fill={i === 0 ? 'var(--led-on)' : 'var(--bg)'}
                stroke="var(--border)"
              />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <circle
                key={`q${i}`}
                cx={214 + i * 16}
                cy={190}
                r={4.5}
                fill={i === 0 ? 'var(--led-on)' : 'var(--bg)'}
                stroke="var(--border)"
              />
            ))}
          </Hot>

          {/* Ports */}
          <Hot part="ethernet" {...hot}>
            <rect
              className="hot"
              x={364}
              y={118}
              width={52}
              height={46}
              rx={4}
              fill="var(--bg)"
              stroke={stroke('ethernet')}
              strokeWidth={active('ethernet') ? 2 : 1}
            />
            <path
              d="M376 132 h28 v18 h-6 v4 h-16 v-4 h-6 z"
              fill="none"
              stroke="var(--text-muted)"
            />
            <text x={390} y={176} textAnchor="middle" {...mono}>
              ETH
            </text>
          </Hot>
          <Hot part="rs485" {...hot}>
            <rect
              className="hot"
              x={428}
              y={118}
              width={64}
              height={46}
              rx={4}
              fill="var(--bg)"
              stroke={stroke('rs485')}
              strokeWidth={active('rs485') ? 2 : 1}
            />
            {['A', 'B', 'G'].map((pin, i) => (
              <g key={pin}>
                <circle cx={442 + i * 18} cy={136} r={5} fill="none" stroke="var(--text-muted)" />
                <text x={442 + i * 18} y={156} textAnchor="middle" {...mono}>
                  {pin}
                </text>
              </g>
            ))}
            <text x={460} y={176} textAnchor="middle" {...mono}>
              RS-485
            </text>
          </Hot>
          <Hot part="usb" {...hot}>
            <rect
              className="hot"
              x={364}
              y={188}
              width={52}
              height={34}
              rx={4}
              fill="var(--bg)"
              stroke={stroke('usb')}
              strokeWidth={active('usb') ? 2 : 1}
            />
            <rect
              x={380}
              y={198}
              width={20}
              height={9}
              rx={2}
              fill="none"
              stroke="var(--text-muted)"
            />
            <text x={390} y={234} textAnchor="middle" {...mono}>
              USB
            </text>
          </Hot>
          <Hot part="sdCard" {...hot}>
            <rect
              className="hot"
              x={428}
              y={188}
              width={64}
              height={34}
              rx={4}
              fill="var(--bg)"
              stroke={stroke('sdCard')}
              strokeWidth={active('sdCard') ? 2 : 1}
            />
            <rect x={442} y={201} width={36} height={6} rx={2} fill="var(--text-muted)" />
            <text x={460} y={234} textAnchor="middle" {...mono}>
              SD
            </text>
          </Hot>

          {/* Expansion connector (right side) */}
          <Hot part="expansion" {...hot}>
            <rect
              className="hot"
              x={540}
              y={110}
              width={28}
              height={120}
              rx={4}
              fill="var(--bg)"
              stroke={stroke('expansion')}
              strokeWidth={active('expansion') ? 2 : 1}
              strokeDasharray="4 3"
            />
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x={549}
                y={120 + i * 13}
                width={10}
                height={6}
                fill="var(--text-muted)"
              />
            ))}
          </Hot>
        </svg>

        <div
          className="min-h-36 rounded-md border border-border bg-bg p-4 text-sm"
          aria-live="polite"
          data-testid="terminal-info"
        >
          {info ? (
            <>
              <h3 className="font-semibold text-text">{info.name}</h3>
              <p className="mt-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
                {strings.what}
              </p>
              <p className="mt-1 text-text">{info.what}</p>
              <p className="mt-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
                {strings.connect}
              </p>
              <p className="mt-1 text-text">{info.connect}</p>
            </>
          ) : (
            <p className="text-text-muted">{strings.empty}</p>
          )}
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-text-muted">{strings.generic}</figcaption>
    </figure>
  );
}
