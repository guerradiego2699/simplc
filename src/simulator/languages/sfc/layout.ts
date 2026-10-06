/**
 * Geometry of an SFC drawing (IEC 61131-3 style), in px.
 *
 * Steps are drawn top to bottom in list order, with their action blocks to the right. Below each
 * step, its outgoing transitions: the first column continues straight down when it leads to the
 * next step; any other target is drawn as a jump (an arrow with the target step's name). Several
 * outgoing transitions form a selection branch (a horizontal line, one column each).
 */
import type { SfcProgram, SfcStep, SfcTransition } from './model';

export const SFC = {
  margin: 24,
  stepW: 120,
  stepH: 40,
  actionX: 26, // gap between step and action block
  actionW: 190,
  actionRow: 24,
  qualifierW: 26,
  branchGap: 170,
  divGap: 14,
  barGap: 22,
  afterBar: 36,
  barW: 26,
} as const;

export interface StepBox {
  step: SfcStep;
  x: number;
  y: number;
  /** Height of the step + its action block. */
  blockH: number;
  /** Center of column 0 (the step's vertical line). */
  cx: number;
  actionsX: number;
}

export interface TransitionBox {
  transition: SfcTransition;
  /** Column center. */
  cx: number;
  /** Bar position. */
  y: number;
  /** Priority among the step's outgoing transitions (1 = first), shown when there are several. */
  priority: number;
  siblings: number;
  /** Continues straight into the next step (else drawn as a jump to `target`). */
  continues: boolean;
  target: SfcStep | undefined;
  /** Where the line below the bar ends. */
  endY: number;
  /** In a selection branch: the divergence line, where this column's line starts. */
  topY: number | null;
}

export interface SfcLayout {
  steps: StepBox[];
  transitions: TransitionBox[];
  /** Divergence lines (selection branches): from column 0 to the last column. */
  branches: { y: number; x1: number; x2: number }[];
  width: number;
  height: number;
}

export function layoutSfc(program: SfcProgram): SfcLayout {
  const { margin, stepW, stepH, actionX, actionW, actionRow } = SFC;
  const cx0 = margin + stepW / 2;
  const actionsX = margin + stepW + actionX;
  const firstBranchX = actionsX + actionW + 60;

  const steps: StepBox[] = [];
  const transitions: TransitionBox[] = [];
  const branches: SfcLayout['branches'] = [];
  const byId = new Map(program.steps.map((s) => [s.id, s]));
  let y: number = margin;
  let width: number = actionsX + actionW + margin;

  program.steps.forEach((step, index) => {
    const blockH = Math.max(stepH, step.actions.length * actionRow);
    steps.push({ step, x: margin, y, blockH, cx: cx0, actionsX });
    const next = program.steps[index + 1];
    const outs = program.transitions.filter((t) => t.from === step.id);
    if (outs.length === 0) {
      y += blockH + SFC.afterBar;
      return;
    }
    // Column 0: the transition to the next step if there is one, else the first.
    const main = outs.find((t) => t.to === next?.id) ?? outs[0]!;
    const ordered = [main, ...outs.filter((t) => t !== main)];
    const divY = y + blockH + SFC.divGap;
    const barY = divY + SFC.barGap;
    const endY = barY + SFC.afterBar;
    const columnX = (k: number) => (k === 0 ? cx0 : firstBranchX + (k - 1) * SFC.branchGap);
    if (ordered.length > 1) {
      const x2 = columnX(ordered.length - 1);
      branches.push({ y: divY, x1: cx0, x2 });
      width = Math.max(width, x2 + SFC.branchGap);
    }
    ordered.forEach((transition, k) => {
      const target = byId.get(transition.to);
      transitions.push({
        transition,
        cx: columnX(k),
        y: barY,
        priority: outs.indexOf(transition) + 1,
        siblings: outs.length,
        continues: k === 0 && target !== undefined && target.id === next?.id,
        target,
        endY,
        topY: ordered.length > 1 ? divY : null,
      });
    });
    y = endY;
  });

  return { steps, transitions, branches, width, height: y + margin };
}
