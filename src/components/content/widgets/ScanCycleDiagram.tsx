import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { Dictionary } from '@/i18n';

type Strings = Dictionary['widgets']['scan'];
type PhaseKey = keyof Strings['phases'];

const PHASES: readonly PhaseKey[] = ['read', 'execute', 'write', 'housekeeping'];
const PHASE_MS = 1800;
const ROW = 'flex items-center justify-between gap-3 rounded-md bg-bg px-3 py-2';

/** Node positions around the loop (SVG units), clockwise from the top. */
const NODES: Record<PhaseKey, { x: number; y: number }> = {
  read: { x: 150, y: 34 },
  execute: { x: 262, y: 150 },
  write: { x: 150, y: 266 },
  housekeeping: { x: 38, y: 150 },
};

interface IoState {
  physIn: boolean;
  inputImage: boolean;
  outputImage: boolean;
  physOut: boolean;
}

/** Applies the effect of entering a phase. Pure, so it is easy to reason about. */
export function enterPhase(phase: PhaseKey, s: IoState): IoState {
  switch (phase) {
    case 'read':
      return { ...s, inputImage: s.physIn };
    case 'execute':
      return { ...s, outputImage: s.inputImage }; // program: Q0.0 := I0.0
    case 'write':
      return { ...s, physOut: s.outputImage };
    default:
      return s;
  }
}

function Bit({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 font-mono text-xs font-semibold ${
        value ? 'bg-led-on text-on-led' : 'bg-surface-2 text-text-muted'
      }`}
    >
      {value ? '1' : '0'}
    </span>
  );
}

export interface State {
  phaseIndex: number;
  cycle: number;
  io: IoState;
}

type Action = { type: 'advance' } | { type: 'toggleInput' };

export function reducer(state: State, action: Action): State {
  if (action.type === 'toggleInput') {
    return { ...state, io: { ...state.io, physIn: !state.io.physIn } };
  }
  const phaseIndex = (state.phaseIndex + 1) % PHASES.length;
  return {
    phaseIndex,
    cycle: phaseIndex === 0 ? state.cycle + 1 : state.cycle,
    io: enterPhase(PHASES[phaseIndex] ?? 'read', state.io),
  };
}

export const INITIAL: State = {
  phaseIndex: 0,
  cycle: 1,
  io: { physIn: false, inputImage: false, outputImage: false, physOut: false },
};

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export default function ScanCycleDiagram({ strings }: { strings: Strings }) {
  const [{ phaseIndex, cycle, io }, dispatch] = useReducer(reducer, INITIAL);
  // On the server we assume reduced motion (paused) so the first render matches.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  // null = the user has not pressed play/pause yet: auto-play unless motion is reduced.
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const playing = userPlaying ?? !reducedMotion;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => dispatch({ type: 'advance' }), PHASE_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const phase = PHASES[phaseIndex] ?? 'read';
  const active = (p: PhaseKey) => p === phase;
  const highlight = (p: PhaseKey) => (active(p) ? 'ring-2 ring-primary' : 'ring-1 ring-border');

  return (
    <figure
      className="not-prose border-border bg-surface my-8 rounded-lg border p-4 sm:p-6"
      aria-label={strings.label}
    >
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,280px)_1fr]">
        {/* Loop */}
        <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[280px]" aria-hidden="true">
          <defs>
            <marker
              id="scan-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted)" />
            </marker>
          </defs>
          <circle
            cx="150"
            cy="150"
            r="112"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
          {/* Arrows between phases (clockwise) */}
          {[
            'M 196 44 A 112 112 0 0 1 252 104',
            'M 252 196 A 112 112 0 0 1 196 256',
            'M 104 256 A 112 112 0 0 1 48 196',
            'M 48 104 A 112 112 0 0 1 104 44',
          ].map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              markerEnd="url(#scan-arrow)"
            />
          ))}
          {PHASES.map((p, i) => {
            const { x, y } = NODES[p];
            const on = active(p);
            return (
              <g key={p}>
                <circle
                  cx={x}
                  cy={y}
                  r="26"
                  fill={on ? 'var(--primary)' : 'var(--bg)'}
                  stroke={on ? 'var(--primary)' : 'var(--border)'}
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 6}
                  textAnchor="middle"
                  fontFamily="var(--ff-mono)"
                  fontSize="17"
                  fontWeight="600"
                  fill={on ? 'var(--on-primary)' : 'var(--text-muted)'}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
          <text
            x="150"
            y="140"
            textAnchor="middle"
            fontSize="12"
            fill="var(--text-muted)"
            fontFamily="var(--ff-sans)"
          >
            {strings.cycle}
          </text>
          <text
            x="150"
            y="168"
            textAnchor="middle"
            fontSize="24"
            fontWeight="600"
            fill="var(--text)"
            fontFamily="var(--ff-mono)"
          >
            {cycle}
          </text>
        </svg>

        {/* Explanation + I/O chain */}
        <div>
          <p className="text-text-muted font-mono text-xs">
            {phaseIndex + 1} / {PHASES.length}
          </p>
          <p className="text-text mt-1 text-lg font-semibold" aria-live="polite">
            {strings.phases[phase].name}
          </p>
          <p className="text-text-muted mt-2 min-h-[4.5rem] text-sm leading-relaxed">
            {strings.phases[phase].description}
          </p>

          <ol className="mt-4 space-y-1.5 text-sm">
            <li className={`${ROW} ring-border ring-1`}>
              <span className="text-text-muted">{strings.physicalInput}</span>
              <button
                type="button"
                role="switch"
                aria-checked={io.physIn}
                aria-label={strings.toggleInput}
                onClick={() => dispatch({ type: 'toggleInput' })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  io.physIn ? 'bg-led-on' : 'bg-wire-off'
                }`}
              >
                <span
                  className={`bg-bg absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform ${
                    io.physIn ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </li>
            <li className={`${ROW} ${highlight('read')}`}>
              <span className="text-text-muted">{strings.inputImage}</span>
              <span className="text-text flex items-center gap-2 font-mono">
                I0.0 <Bit value={io.inputImage} />
              </span>
            </li>
            <li className={`${ROW} ${highlight('execute')}`}>
              <span className="text-text-muted">{strings.program}</span>
              <span className="text-text font-mono">Q0.0 := I0.0</span>
            </li>
            <li className={`${ROW} ${highlight('execute')}`}>
              <span className="text-text-muted">{strings.outputImage}</span>
              <span className="text-text flex items-center gap-2 font-mono">
                Q0.0 <Bit value={io.outputImage} />
              </span>
            </li>
            <li className={`${ROW} ${highlight('write')}`}>
              <span className="text-text-muted">{strings.physicalOutput}</span>
              <span
                data-testid="scan-physical-output"
                data-on={io.physOut}
                className={`size-6 shrink-0 rounded-full border-2 ${
                  io.physOut ? 'border-led-on bg-led-on' : 'border-wire-off bg-surface-2'
                }`}
              />
            </li>
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUserPlaying(!playing)}
              className="bg-primary text-on-primary hover:bg-primary-hover inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold"
            >
              {playing ? strings.pause : strings.play}
            </button>
            <button
              type="button"
              onClick={() => {
                setUserPlaying(false);
                dispatch({ type: 'advance' });
              }}
              className="border-border bg-bg text-text hover:border-primary inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold"
            >
              {strings.step}
            </button>
          </div>
          <p className="text-text-muted mt-3 text-xs">{strings.hint}</p>
        </div>
      </div>
    </figure>
  );
}
