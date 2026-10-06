/**
 * Draws an SFC chart (props only, no store): used by the simulator editor and by static content
 * pages. Live values are optional: the active step is filled with --led-on, a TRUE transition
 * condition is drawn with --wire-on, and action variables that are on show a lit LED.
 */
import type { KeyboardEvent } from 'react';
import { layoutSfc, SFC } from '../layout';
import type { SfcProgram } from '../model';

export interface SfcLive {
  active(stepId: string): boolean;
  /** Formatted time in the step, while active. */
  time(stepId: string): string | null;
  condition(transitionId: string): boolean | undefined;
  variable(name: string): boolean | undefined;
}

export interface SfcDiagramLabels {
  step(name: string, initial: boolean): string;
  transition(from: string, to: string, condition: string): string;
  /** Short text for a jump arrow, e.g. "→ S0". */
  jump(name: string): string;
}

export interface SfcDiagramProps {
  program: SfcProgram;
  labels: SfcDiagramLabels;
  live?: SfcLive | undefined;
  selected?: { kind: 'step' | 'transition'; id: string } | null | undefined;
  onSelect?: ((sel: { kind: 'step' | 'transition'; id: string }) => void) | undefined;
  /** Worst diagnostic per step/transition/action id. */
  problems?: ReadonlyMap<string, { severity: 'error' | 'warning'; message: string }> | undefined;
  zoom?: number;
}

const MAX_CONDITION = 30;
const shorten = (text: string) =>
  text.length > MAX_CONDITION ? `${text.slice(0, MAX_CONDITION - 1)}…` : text;

export function SfcDiagram({
  program,
  labels,
  live,
  selected,
  onSelect,
  problems,
  zoom = 1,
}: SfcDiagramProps) {
  const layout = layoutSfc(program);
  const interactive = onSelect !== undefined;
  const keyHandler =
    (sel: { kind: 'step' | 'transition'; id: string }) => (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(sel);
      }
    };
  const outline = (id: string, isSelected: boolean) => {
    const problem = problems?.get(id);
    if (problem?.severity === 'error') return 'var(--danger)';
    if (isSelected) return 'var(--primary)';
    if (problem) return 'var(--warning)';
    return 'var(--text)';
  };
  const line = 'var(--wire-off)';

  return (
    <svg
      width={layout.width * zoom}
      height={layout.height * zoom}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block font-mono select-none"
      data-sfc-diagram
    >
      {/* Divergence lines of selection branches */}
      {layout.branches.map((b, i) => (
        <g key={`b${i}`} stroke={line} strokeWidth={2}>
          <line x1={b.x1} y1={b.y} x2={b.x2} y2={b.y} />
        </g>
      ))}

      {layout.steps.map(({ step, x, y, blockH, cx, actionsX }) => {
        const active = live?.active(step.id) ?? false;
        const isSelected = selected?.kind === 'step' && selected.id === step.id;
        const time = active ? live?.time(step.id) : null;
        const outs = layout.transitions.filter((t) => t.transition.from === step.id);
        const firstBar = outs[0];
        const sel = { kind: 'step' as const, id: step.id };
        const problem = problems?.get(step.id);
        return (
          <g key={step.id}>
            {/* Line from the step down to its transition(s) */}
            {firstBar && (
              <line
                x1={cx}
                y1={y + SFC.stepH}
                x2={cx}
                y2={outs.length > 1 ? y + blockH + SFC.divGap : firstBar.y}
                stroke={line}
                strokeWidth={2}
              />
            )}
            <g
              data-step={step.name}
              data-active={active}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-pressed': isSelected,
                    onClick: () => onSelect?.(sel),
                    onKeyDown: keyHandler(sel),
                    className: 'cursor-pointer outline-none focus-visible:[&>rect]:stroke-primary',
                  }
                : {})}
              aria-label={labels.step(step.name, step.initial)}
            >
              {problem && <title>{problem.message}</title>}
              <rect
                x={x}
                y={y}
                width={SFC.stepW}
                height={SFC.stepH}
                rx={2}
                fill={active ? 'var(--led-on)' : 'var(--bg)'}
                stroke={outline(step.id, isSelected)}
                strokeWidth={isSelected || problem ? 2.5 : 1.5}
              />
              {step.initial && (
                <rect
                  x={x + 4}
                  y={y + 4}
                  width={SFC.stepW - 8}
                  height={SFC.stepH - 8}
                  rx={1}
                  fill="none"
                  stroke={active ? 'var(--on-led)' : 'var(--text)'}
                  strokeWidth={1.2}
                />
              )}
              <text
                x={x + SFC.stepW / 2}
                y={y + (time ? 18 : 25)}
                textAnchor="middle"
                className="text-[13px] font-semibold"
                fill={active ? 'var(--on-led)' : 'var(--text)'}
              >
                {step.name}
              </text>
              {time && (
                <text
                  x={x + SFC.stepW / 2}
                  y={y + 32}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="var(--on-led)"
                  data-step-time
                >
                  {time}
                </text>
              )}
            </g>

            {/* Action block */}
            {step.actions.length > 0 && (
              <g>
                <line
                  x1={x + SFC.stepW}
                  y1={y + SFC.stepH / 2}
                  x2={actionsX}
                  y2={y + SFC.stepH / 2}
                  stroke={line}
                  strokeWidth={1.5}
                />
                {step.actions.map((a, k) => {
                  const ay =
                    y + (blockH - step.actions.length * SFC.actionRow) / 2 + k * SFC.actionRow;
                  const value = live?.variable(a.variable);
                  const actionProblem = problems?.get(a.id);
                  return (
                    <g key={a.id} data-action={a.variable}>
                      {actionProblem && <title>{actionProblem.message}</title>}
                      <rect
                        x={actionsX}
                        y={ay}
                        width={SFC.actionW}
                        height={SFC.actionRow}
                        fill="var(--bg)"
                        stroke={
                          actionProblem?.severity === 'error'
                            ? 'var(--danger)'
                            : actionProblem
                              ? 'var(--warning)'
                              : 'var(--border)'
                        }
                      />
                      <rect
                        x={actionsX}
                        y={ay}
                        width={SFC.qualifierW}
                        height={SFC.actionRow}
                        fill="var(--surface-2)"
                        stroke="var(--border)"
                      />
                      <text
                        x={actionsX + SFC.qualifierW / 2}
                        y={ay + 16}
                        textAnchor="middle"
                        className="fill-text text-[12px] font-semibold"
                      >
                        {a.qualifier}
                      </text>
                      <text
                        x={actionsX + SFC.qualifierW + 8}
                        y={ay + 16}
                        className="fill-text text-[12px]"
                      >
                        {shorten(a.variable || '???')}
                      </text>
                      {live && (
                        <circle
                          cx={actionsX + SFC.actionW - 11}
                          cy={ay + SFC.actionRow / 2}
                          r={5}
                          fill={value ? 'var(--led-on)' : 'var(--surface-2)'}
                          stroke="var(--border)"
                          data-on={value === true}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })}

      {layout.transitions.map((tb) => {
        const t = tb.transition;
        const value = live?.condition(t.id);
        const isSelected = selected?.kind === 'transition' && selected.id === t.id;
        const problem = problems?.get(t.id);
        const from = program.steps.find((s) => s.id === t.from)?.name ?? '?';
        const to = tb.target?.name ?? '?';
        const sel = { kind: 'transition' as const, id: t.id };
        return (
          <g key={t.id}>
            {/* Vertical line from the divergence to the bar (branch columns) */}
            {tb.topY !== null && (
              <line x1={tb.cx} y1={tb.topY} x2={tb.cx} y2={tb.y} stroke={line} strokeWidth={2} />
            )}
            {/* Below the bar: into the next step, or a jump arrow */}
            {tb.continues ? (
              <line x1={tb.cx} y1={tb.y} x2={tb.cx} y2={tb.endY} stroke={line} strokeWidth={2} />
            ) : (
              <g data-jump={to}>
                <line
                  x1={tb.cx}
                  y1={tb.y}
                  x2={tb.cx}
                  y2={tb.endY - 16}
                  stroke={line}
                  strokeWidth={2}
                />
                <path
                  d={`M${tb.cx - 6} ${tb.endY - 16} L ${tb.cx + 6} ${tb.endY - 16} L ${tb.cx} ${tb.endY - 6} Z`}
                  fill="var(--text)"
                />
                <text
                  x={tb.cx + 10}
                  y={tb.endY - 6}
                  className="fill-text text-[12px] font-semibold"
                >
                  {labels.jump(to)}
                </text>
              </g>
            )}
            <g
              data-transition={`${from}->${to}`}
              data-value={value === undefined ? undefined : String(value)}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-pressed': isSelected,
                    onClick: () => onSelect?.(sel),
                    onKeyDown: keyHandler(sel),
                    className: 'cursor-pointer outline-none',
                  }
                : {})}
              aria-label={labels.transition(from, to, t.condition)}
            >
              {problem && <title>{problem.message}</title>}
              {/* Hit area */}
              <rect
                x={tb.cx - SFC.barW}
                y={tb.y - 12}
                width={SFC.barW + 14 + MAX_CONDITION * 7.4}
                height={24}
                fill="transparent"
                stroke={isSelected ? 'var(--primary)' : 'none'}
                strokeDasharray="4 3"
                rx={3}
              />
              <rect
                x={tb.cx - SFC.barW / 2}
                y={tb.y - 2.5}
                width={SFC.barW}
                height={5}
                fill={value ? 'var(--wire-on)' : outline(t.id, false)}
              />
              {tb.siblings > 1 && (
                <text
                  x={tb.cx - SFC.barW / 2 - 6}
                  y={tb.y + 4}
                  textAnchor="end"
                  className="fill-text-muted text-[10px]"
                >
                  {tb.priority}
                </text>
              )}
              <text
                x={tb.cx + SFC.barW / 2 + 8}
                y={tb.y + 4}
                className="text-[12px]"
                fill={problem?.severity === 'error' ? 'var(--danger)' : 'var(--text)'}
              >
                {shorten(t.condition || '???')}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
