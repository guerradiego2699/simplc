import { CircleAlert, CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { diagnosticMessage } from './diagnostics';
import { fmt, useSim, useStoreApi, useStrings } from './context';

export function ConsolePanel() {
  const t = useStrings();
  const store = useStoreApi();
  const { diagnostics, st, sfc, sfcProgram, rungs, fbd, fault, notLoaded } = useSim(
    useShallow((s) => ({
      diagnostics: s.compiled.diagnostics,
      // ST and IL diagnostics both point at source lines.
      st: s.compiled.st ?? s.compiled.il,
      sfc: s.compiled.sfc,
      sfcProgram: s.project.sfc,
      rungs: s.project.ladder.rungs,
      fbd: s.project.language === 'FBD',
      fault: s.snapshot?.fault ?? null,
      notLoaded: s.notLoaded,
    })),
  );

  const rungNumber = (id?: string) => (id ? rungs.findIndex((r) => r.id === id) + 1 : 0);
  const severityOrder = (a: { severity: string }, b: { severity: string }) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1;
  const sorted = [...diagnostics].sort(
    (a, b) => severityOrder(a, b) || rungNumber(a.rungId) - rungNumber(b.rungId),
  );
  // Structured Text: one entry per diagnostic, located by line and column.
  const stSorted = st
    ? [...st.diagnostics].sort(
        (a, b) => severityOrder(a, b) || a.range.start.offset - b.range.start.offset,
      )
    : [];
  // SFC: located by step / transition / action.
  const sfcSorted = sfc ? [...sfc.diagnostics].sort(severityOrder) : [];
  const stepName = (id?: string) => sfcProgram?.steps.find((x) => x.id === id)?.name ?? '?';
  const sfcLocation = (d: (typeof sfcSorted)[number]) => {
    const { target } = d;
    if (target.kind === 'step') return fmt(t.sfc.location.step, { name: stepName(target.id) });
    if (target.kind === 'action')
      return fmt(t.sfc.location.action, { name: stepName(target.stepId) });
    if (target.kind === 'transition') {
      const tr = sfcProgram?.transitions.find((x) => x.id === target.id);
      return fmt(t.sfc.location.transition, { from: stepName(tr?.from), to: stepName(tr?.to) });
    }
    return t.sfc.location.program;
  };
  const icon = (severity: string) =>
    severity === 'error' ? (
      <CircleX size={15} className="mt-0.5 shrink-0 text-danger" aria-label="error" />
    ) : (
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-label="warning" />
    );

  return (
    <div className="h-full overflow-y-auto" role="log" aria-live="polite">
      <ul className="divide-y divide-border text-[13px]">
        {fault && (
          <li className="flex items-center gap-2 bg-danger/10 px-3 py-2 font-medium text-text">
            <CircleX size={15} className="shrink-0 text-danger" aria-hidden="true" />
            {t.faults[fault.code]}
          </li>
        )}
        {notLoaded && (
          <li className="flex items-center gap-2 px-3 py-2 text-text">
            <CircleAlert size={15} className="shrink-0 text-danger" aria-hidden="true" />
            {t.console.notLoaded}
          </li>
        )}
        {sorted.map((d, i) => {
          const n = rungNumber(d.rungId);
          return (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
                onClick={() => {
                  if (d.elementId) store.getState().select({ kind: 'element', id: d.elementId });
                  else if (d.rungId) store.getState().select({ kind: 'rung', id: d.rungId });
                }}
              >
                {d.severity === 'error' ? (
                  <CircleX size={15} className="mt-0.5 shrink-0 text-danger" aria-label="error" />
                ) : (
                  <TriangleAlert
                    size={15}
                    className="mt-0.5 shrink-0 text-warning"
                    aria-label="warning"
                  />
                )}
                <span className="flex-1 text-text">{diagnosticMessage(d, t)}</span>
                {n > 0 && (
                  <span className="shrink-0 font-mono text-xs text-text-muted">
                    {fmt(fbd ? t.fbd.location : t.console.location, { n })}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {stSorted.map((d, i) => (
          <li key={`st${i}`}>
            <button
              type="button"
              data-st-diagnostic={d.code}
              className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
              onClick={() =>
                store.setState({
                  stReveal: { line: d.range.start.line, col: d.range.start.col, id: Date.now() },
                })
              }
            >
              {icon(d.severity)}
              <span className="flex-1 text-text">{diagnosticMessage(d, t)}</span>
              <span className="shrink-0 font-mono text-xs text-text-muted">
                {fmt(t.st.location, { line: d.range.start.line, col: d.range.start.col })}
              </span>
            </button>
          </li>
        ))}
        {sfcSorted.map((d, i) => (
          <li key={`sfc${i}`}>
            <button
              type="button"
              data-sfc-diagnostic={d.code}
              className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
              onClick={() => {
                const { target } = d;
                const id = target.kind === 'action' ? target.stepId : target.id;
                if (!id) return;
                store
                  .getState()
                  .selectSfc({ kind: target.kind === 'transition' ? 'transition' : 'step', id });
                store.getState().setLayout({ rightTab: 'properties' });
              }}
            >
              {icon(d.severity)}
              <span className="flex-1 text-text">{diagnosticMessage(d, t)}</span>
              <span className="shrink-0 font-mono text-xs text-text-muted">{sfcLocation(d)}</span>
            </button>
          </li>
        ))}
        {sorted.length === 0 &&
          stSorted.length === 0 &&
          sfcSorted.length === 0 &&
          !fault &&
          !notLoaded && (
            <li className="flex items-center gap-2 px-3 py-2 text-text-muted">
              <CircleCheck size={15} className="text-text-muted" aria-hidden="true" />
              {t.console.ok}
            </li>
          )}
      </ul>
    </div>
  );
}
