/**
 * SFC editor for the simulator: the chart (SfcDiagram) with a small tool bar, the properties
 * panel for the selected step or transition, and the help panel shown instead of the palette.
 * Every change goes through `store.commit` (undoable). In RUN the chart shows the active step,
 * its time, the value of each transition condition and the action variables.
 */
import { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, Flag, GitBranchPlus, Plus, SquarePlus, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { formatValue, liveValue } from '@/simulator/languages/ladder/editor/ElementView';
import { resolveOperand } from '@/simulator/project/tags';
import { diagnosticMessage } from '@/simulator/ui/diagnostics';
import {
  fmt,
  useLocale,
  useSim,
  useStoreApi,
  useStrings,
  type SimStrings,
} from '@/simulator/ui/context';
import { sfcProbe, type SfcDiagnostic } from '../compile';
import {
  addAction,
  addStepAfter,
  addTransition,
  moveStep,
  moveTransition,
  removeAction,
  renameStep,
  setInitial,
  SFC_QUALIFIERS,
  starterSfc,
  updateAction,
  updateStep,
  updateTransition,
  type SfcProgram,
  type SfcQualifier,
} from '../model';
import { SfcDiagram, type SfcDiagramLabels, type SfcLive } from './SfcDiagram';

export function sfcLabels(t: SimStrings): SfcDiagramLabels {
  return {
    step: (name, initial) => fmt(initial ? t.sfc.initialStepLabel : t.sfc.stepLabel, { name }),
    transition: (from, to, condition) => fmt(t.sfc.transitionLabel, { from, to, condition }),
    jump: (name) => fmt(t.sfc.jump, { name }),
  };
}

/** Worst diagnostic (with its message) per step, transition and action id. */
function problemMap(list: readonly SfcDiagnostic[], t: SimStrings) {
  const map = new Map<string, { severity: 'error' | 'warning'; message: string }>();
  for (const d of list) {
    const id = d.target.id;
    if (!id) continue;
    const current = map.get(id);
    if (current?.severity === 'error') continue;
    map.set(id, { severity: d.severity, message: diagnosticMessage(d, t) });
  }
  return map;
}

const toolButton =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text hover:bg-surface disabled:opacity-35 disabled:hover:bg-transparent';

export function SfcEditor() {
  const t = useStrings();
  const store = useStoreApi();
  const locale = useLocale();
  const { sfc, compiled, selection, status, snapshot, probes, zoom, tags } = useSim(
    useShallow((s) => ({
      sfc: s.project.sfc,
      compiled: s.compiled.sfc,
      selection: s.sfcSelection,
      status: s.status,
      snapshot: s.snapshot,
      probes: s.probes,
      zoom: s.zoom,
      tags: s.project.tags,
    })),
  );

  // A project in SFC always has a chart (e.g. a hand-edited file without one).
  useEffect(() => {
    if (!sfc) store.getState().commit((p) => (p.sfc ? p : { ...p, sfc: starterSfc() }));
  }, [sfc, store]);

  const labels = useMemo(() => sfcLabels(t), [t]);
  const problems = useMemo(() => problemMap(compiled?.diagnostics ?? [], t), [compiled, t]);
  if (!sfc) return null;

  const numberLocale = locale === 'es' ? 'es-CL' : 'en-US';
  const running = status !== 'stopped' && snapshot !== null;
  const live: SfcLive | undefined = running
    ? {
        active: (id) => {
          const x = compiled?.steps[id]?.x;
          return x ? liveValue(x, snapshot) === true : false;
        },
        time: (id) => {
          const timer = compiled?.steps[id]?.timer;
          if (!timer) return null;
          const address = `${timer}.ET`;
          return formatValue(liveValue(address, snapshot), address, numberLocale);
        },
        condition: (id) => {
          const v = probes[sfcProbe(id)];
          return typeof v === 'boolean' ? v : undefined;
        },
        variable: (name) => {
          const res = resolveOperand(name.trim(), tags);
          return res.ok ? liveValue(res.address, snapshot) === true : undefined;
        },
      }
    : undefined;

  const commit = (update: (p: SfcProgram) => SfcProgram, key?: string) =>
    store.getState().commit((p) => ({ ...p, sfc: update(p.sfc ?? starterSfc()) }), key);
  const select = store.getState().selectSfc;

  const selectedStep =
    selection?.kind === 'step' ? sfc.steps.find((s) => s.id === selection.id) : undefined;
  const selectedTransition =
    selection?.kind === 'transition'
      ? sfc.transitions.find((x) => x.id === selection.id)
      : undefined;
  const anchorStep = selectedStep?.id ?? selectedTransition?.from ?? null;

  return (
    <div className="flex h-full flex-col" data-testid="sfc-editor">
      <div
        role="toolbar"
        aria-label={t.sfc.toolbar}
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-surface-2 px-2"
      >
        <button
          type="button"
          className={toolButton}
          onClick={() => {
            let created = '';
            commit((p) => {
              const r = addStepAfter(p, anchorStep);
              created = r.step.id;
              return r.program;
            });
            select({ kind: 'step', id: created });
          }}
        >
          <SquarePlus size={15} aria-hidden="true" />
          {t.sfc.addStep}
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!selectedStep}
          onClick={() => {
            if (!selectedStep) return;
            let created = '';
            commit((p) => {
              const target = p.steps.find((s) => s.initial) ?? p.steps[0]!;
              const r = addTransition(p, selectedStep.id, target.id);
              created = r.transition.id;
              return r.program;
            });
            select({ kind: 'transition', id: created });
          }}
        >
          <GitBranchPlus size={15} aria-hidden="true" />
          {t.sfc.addTransition}
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <button
          type="button"
          className={toolButton}
          disabled={!selectedStep || selectedStep.initial}
          title={t.sfc.setInitial}
          aria-label={t.sfc.setInitial}
          onClick={() => selectedStep && commit((p) => setInitial(p, selectedStep.id))}
        >
          <Flag size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!selection}
          title={selectedTransition ? t.sfc.raisePriority : t.sfc.moveUp}
          aria-label={selectedTransition ? t.sfc.raisePriority : t.sfc.moveUp}
          onClick={() =>
            selection &&
            commit((p) =>
              selection.kind === 'step'
                ? moveStep(p, selection.id, -1)
                : moveTransition(p, selection.id, -1),
            )
          }
        >
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!selection}
          title={selectedTransition ? t.sfc.lowerPriority : t.sfc.moveDown}
          aria-label={selectedTransition ? t.sfc.lowerPriority : t.sfc.moveDown}
          onClick={() =>
            selection &&
            commit((p) =>
              selection.kind === 'step'
                ? moveStep(p, selection.id, 1)
                : moveTransition(p, selection.id, 1),
            )
          }
        >
          <ArrowDown size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!selection}
          title={t.sfc.delete}
          aria-label={t.sfc.delete}
          onClick={() => store.getState().deleteSfcSelection()}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto bg-bg p-3"
        role="region"
        aria-label={t.sfc.label}
        onClick={(e) => {
          if (e.target === e.currentTarget) select(null);
        }}
      >
        <SfcDiagram
          program={sfc}
          labels={labels}
          live={live}
          selected={selection}
          onSelect={(sel) => {
            select(sel);
            store.getState().setLayout({ rightTab: 'properties' });
          }}
          problems={problems}
          zoom={zoom}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------- properties

const field = 'rounded-md border border-border bg-bg px-2 py-1 text-sm text-text';
const smallButton =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text';

export function SfcProperties() {
  const t = useStrings();
  const store = useStoreApi();
  const { sfc, selection, diagnostics, tags } = useSim(
    useShallow((s) => ({
      sfc: s.project.sfc,
      selection: s.sfcSelection,
      diagnostics: s.compiled.sfc?.diagnostics ?? [],
      tags: s.project.tags,
    })),
  );
  if (!sfc) return null;
  const commit = (update: (p: SfcProgram) => SfcProgram, key?: string) =>
    store.getState().commit((p) => ({ ...p, sfc: update(p.sfc ?? starterSfc()) }), key);
  const messages = (ids: string[]) =>
    diagnostics
      .filter((d) => ids.includes(d.target.id))
      .map((d, i) => (
        <li
          key={i}
          className={`text-xs ${d.severity === 'error' ? 'text-danger' : 'text-text-muted'}`}
        >
          {diagnosticMessage(d, t)}
        </li>
      ));

  const step = selection?.kind === 'step' ? sfc.steps.find((s) => s.id === selection.id) : null;
  const transition =
    selection?.kind === 'transition' ? sfc.transitions.find((x) => x.id === selection.id) : null;

  if (step) {
    return (
      <div
        className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm"
        data-testid="sfc-properties"
      >
        <h2 className="font-semibold text-text">{t.sfc.step}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">{t.sfc.name}</span>
          <input
            className={`${field} font-mono`}
            value={step.name}
            spellCheck={false}
            data-testid="sfc-step-name"
            onChange={(e) =>
              commit((p) => renameStep(p, step.id, e.target.value), `sfc-name-${step.id}`)
            }
          />
        </label>
        <label className="flex items-center gap-2 text-text">
          <input
            type="checkbox"
            checked={step.initial}
            disabled={step.initial}
            onChange={() => commit((p) => setInitial(p, step.id))}
          />
          {t.sfc.initial}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">{t.sfc.comment}</span>
          <textarea
            className={field}
            rows={2}
            value={step.comment}
            onChange={(e) =>
              commit(
                (p) => updateStep(p, step.id, { comment: e.target.value }),
                `sfc-comment-${step.id}`,
              )
            }
          />
        </label>
        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-text-muted">{t.sfc.actions}</h3>
          {step.actions.length === 0 && (
            <p className="text-xs text-text-muted">{t.sfc.noActions}</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {step.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-1.5" data-sfc-action={a.id}>
                <select
                  aria-label={t.sfc.qualifier}
                  title={t.sfc.qualifiers[a.qualifier]}
                  className={`${field} w-14 font-mono`}
                  value={a.qualifier}
                  onChange={(e) =>
                    commit((p) =>
                      updateAction(p, step.id, a.id, { qualifier: e.target.value as SfcQualifier }),
                    )
                  }
                >
                  {SFC_QUALIFIERS.map((q) => (
                    <option key={q} value={q} title={t.sfc.qualifiers[q]}>
                      {q}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t.sfc.variable}
                  className={`${field} min-w-0 flex-1 font-mono`}
                  value={a.variable}
                  list="sfc-variables"
                  spellCheck={false}
                  onChange={(e) =>
                    commit(
                      (p) => updateAction(p, step.id, a.id, { variable: e.target.value }),
                      `sfc-action-${a.id}`,
                    )
                  }
                />
                <button
                  type="button"
                  className={smallButton}
                  aria-label={t.sfc.removeAction}
                  title={t.sfc.removeAction}
                  onClick={() => commit((p) => removeAction(p, step.id, a.id))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <datalist id="sfc-variables">
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text hover:bg-surface-2"
            onClick={() => commit((p) => addAction(p, step.id))}
          >
            <Plus size={13} aria-hidden="true" />
            {t.sfc.addAction}
          </button>
          <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-text-muted">
            {SFC_QUALIFIERS.map((q) => (
              <li key={q}>{t.sfc.qualifiers[q]}</li>
            ))}
          </ul>
        </section>
        <ul className="flex flex-col gap-1">
          {messages([step.id, ...step.actions.map((a) => a.id)])}
        </ul>
      </div>
    );
  }

  if (transition) {
    const from = sfc.steps.find((s) => s.id === transition.from);
    const siblings = sfc.transitions.filter((x) => x.from === transition.from);
    return (
      <div
        className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm"
        data-testid="sfc-properties"
      >
        <h2 className="font-semibold text-text">{t.sfc.transition}</h2>
        <p className="text-xs text-text-muted">
          {t.sfc.from}: <span className="font-mono text-text">{from?.name ?? '?'}</span>
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">{t.sfc.to}</span>
          <select
            className={`${field} font-mono`}
            value={transition.to}
            data-testid="sfc-transition-to"
            onChange={(e) =>
              commit((p) => updateTransition(p, transition.id, { to: e.target.value }))
            }
          >
            {sfc.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">{t.sfc.condition}</span>
          <textarea
            className={`${field} font-mono`}
            rows={3}
            spellCheck={false}
            value={transition.condition}
            data-testid="sfc-condition"
            onChange={(e) =>
              commit(
                (p) => updateTransition(p, transition.id, { condition: e.target.value }),
                `sfc-condition-${transition.id}`,
              )
            }
          />
          <span className="text-xs text-text-muted">{t.sfc.conditionHint}</span>
        </label>
        {siblings.length > 1 && (
          <p className="text-xs text-text-muted">
            {fmt(t.sfc.priority, { n: siblings.indexOf(transition) + 1, total: siblings.length })}
          </p>
        )}
        <ul className="flex flex-col gap-1">{messages([transition.id])}</ul>
      </div>
    );
  }

  return (
    <div className="p-3 text-sm text-text-muted" data-testid="sfc-properties">
      {t.sfc.noSelection}
      <ul className="mt-3 flex flex-col gap-1">
        {diagnostics
          .filter((d) => d.target.kind === 'program')
          .map((d, i) => (
            <li key={i} className="text-xs text-danger">
              {diagnosticMessage(d, t)}
            </li>
          ))}
      </ul>
    </div>
  );
}

/** Left panel in SFC: how charts work (instead of the instruction palette). */
export function SfcHelp() {
  const t = useStrings();
  const h = t.sfc.help;
  return (
    <aside
      aria-label={h.title}
      className="flex h-full flex-col overflow-y-auto border-r border-border bg-surface"
    >
      <h2 className="border-b border-border px-3 py-2 text-xs font-semibold tracking-wider text-text-muted uppercase">
        {h.title}
      </h2>
      <ul className="flex flex-col gap-2 p-3 text-xs leading-relaxed text-text">
        {h.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
