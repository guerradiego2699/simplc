import { useMemo } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { indexDiagnostics } from './diagnostics';
import { fmt, useController, useLocale, useSim, useStoreApi, useStrings } from './context';

export function StatusBar() {
  const t = useStrings();
  const locale = useLocale();
  const store = useStoreApi();
  const controller = useController();
  const { status, timeMs, diagnostics, zoom, autosave } = useSim(
    useShallow((s) => ({
      status: s.status,
      timeMs: s.snapshot?.timeMs ?? 0,
      diagnostics: s.compiled.diagnostics,
      zoom: s.zoom,
      autosave: s.autosave,
    })),
  );
  const { errors, warnings } = useMemo(() => indexDiagnostics(diagnostics), [diagnostics]);

  const mode = status === 'running' ? 'RUN' : status === 'paused' ? 'PAUSE' : 'STOP';
  const dot =
    status === 'running' ? 'bg-led-on' : status === 'paused' ? 'bg-warning' : 'bg-wire-off';
  const seconds = (timeMs / 1000).toLocaleString(locale === 'es' ? 'es-CL' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <footer className="flex h-7 items-center gap-4 border-t border-border bg-surface-2 px-3 font-mono text-[11px] text-text-muted">
      <span
        className="inline-flex items-center gap-1.5 font-semibold text-text"
        data-testid="plc-status"
      >
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        {t.status[mode]}
      </span>
      <span>{fmt(t.status.cycle, { ms: controller.cycleTimeMs })}</span>
      <span>{fmt(t.status.time, { s: seconds })}</span>
      <button
        type="button"
        className="hover:text-text"
        onClick={() => store.getState().setLayout({ bottomTab: 'console' })}
      >
        <span className={errors > 0 ? 'font-semibold text-danger' : ''}>
          {fmt(t.status.errors, { n: errors })}
        </span>
        {' · '}
        <span>{fmt(t.status.warnings, { n: warnings })}</span>
      </button>
      {autosave && (
        <span
          data-testid="autosave-status"
          data-state={autosave}
          className={`ml-auto inline-flex items-center gap-1 font-sans ${autosave === 'unavailable' ? 'font-semibold text-danger' : ''}`}
        >
          {autosave === 'saved' ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <CircleAlert size={12} aria-hidden="true" />
          )}
          {autosave === 'saved' ? t.status.saved : t.status.notSaved}
        </span>
      )}
      <span className={autosave ? '' : 'ml-auto'}>
        {fmt(t.status.zoom, { n: Math.round(zoom * 100) })}
      </span>
      <span className="uppercase">{locale}</span>
    </footer>
  );
}
