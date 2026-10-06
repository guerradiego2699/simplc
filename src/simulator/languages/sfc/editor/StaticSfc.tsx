/**
 * Read-only SFC chart for content pages (rendered at build time, no JavaScript).
 */
import type { SfcProgram } from '../model';
import { SfcDiagram } from './SfcDiagram';

interface Props {
  program: SfcProgram;
  /** Templates from the dictionary: "Etapa {name}", "Etapa inicial {name}"… */
  strings: {
    chartLabel: string;
    stepLabel: string;
    initialStepLabel: string;
    transitionLabel: string;
    jump: string;
  };
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);

export function StaticSfc({ program, strings }: Props) {
  return (
    <div
      className="overflow-x-auto rounded-md border border-border bg-bg p-2"
      data-static-sfc
      // Scrollable on narrow screens: keyboard users must be able to reach it.
      tabIndex={0}
      role="region"
      aria-label={strings.chartLabel}
    >
      <SfcDiagram
        program={program}
        labels={{
          step: (name, initial) =>
            fill(initial ? strings.initialStepLabel : strings.stepLabel, { name }),
          transition: (from, to, condition) =>
            fill(strings.transitionLabel, { from, to, condition }),
          jump: (name) => fill(strings.jump, { name }),
        }}
      />
    </div>
  );
}
