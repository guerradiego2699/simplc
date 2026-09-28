import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FilePlus2,
  FileText,
  Pause,
  Play,
  Redo2,
  SkipForward,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { emptyProject, motorStartStopProject } from '@/simulator/project/examples';
import { SPEEDS, ZOOM } from '@/simulator/store/simulator-store';
import type { Language } from '@/simulator/project/types';
import { useController, useSim, useStoreApi, useStrings } from './context';

const LANGUAGES: Language[] = ['LD', 'ST', 'FBD', 'IL', 'SFC'];

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-md text-text hover:bg-surface disabled:opacity-35 disabled:hover:bg-transparent';

export function Toolbar() {
  const t = useStrings();
  const store = useStoreApi();
  const controller = useController();
  const { status, speed, canUndo, canRedo, zoom, language } = useSim(
    useShallow((s) => ({
      status: s.status,
      speed: s.speed,
      canUndo: s.past.length > 0,
      canRedo: s.future.length > 0,
      zoom: s.zoom,
      language: s.project.language,
    })),
  );

  const replace = (next: ReturnType<typeof emptyProject>) => {
    if (!window.confirm(t.toolbar.confirmDiscard)) return;
    controller.stop();
    store.getState().commit(() => next);
    store.getState().select(null);
  };

  return (
    <div
      role="toolbar"
      aria-label={t.toolbar.label}
      className="flex h-11 items-center gap-1 border-b border-border bg-surface-2 px-2"
    >
      <FileMenu
        onNew={() => replace(emptyProject())}
        onExample={() => replace(motorStartStopProject(t.example))}
      />

      <Divider />

      <span className="px-1 text-xs text-text-muted">{t.toolbar.language}</span>
      <div
        className="inline-flex rounded-md border border-border bg-bg p-0.5"
        role="group"
        aria-label={t.toolbar.language}
      >
        {LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            disabled={l !== 'LD'}
            aria-pressed={l === language}
            title={l === 'LD' ? l : `${l} — ${t.toolbar.comingSoon}`}
            className="h-6 rounded px-2 font-mono text-xs font-semibold text-text-muted disabled:opacity-40 aria-pressed:bg-primary aria-pressed:text-on-primary"
          >
            {l}
          </button>
        ))}
      </div>

      <Divider />

      {status === 'running' ? (
        <button
          type="button"
          className={iconBtn}
          title={t.toolbar.pause}
          aria-label={t.toolbar.pause}
          onClick={() => controller.pause()}
        >
          <Pause size={17} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className={`${iconBtn} text-primary`}
          title={t.toolbar.run}
          aria-label={t.toolbar.run}
          onClick={() => controller.run()}
        >
          <Play size={17} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={iconBtn}
        title={t.toolbar.stop}
        aria-label={t.toolbar.stop}
        disabled={status === 'stopped'}
        onClick={() => controller.stop()}
      >
        <Square size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={iconBtn}
        title={t.toolbar.step}
        aria-label={t.toolbar.step}
        onClick={() => controller.step()}
      >
        <SkipForward size={17} aria-hidden="true" />
      </button>

      <label className="ml-1 flex items-center gap-1.5 text-xs text-text-muted">
        {t.toolbar.speed}
        <select
          className="h-7 rounded-md border border-border bg-bg px-1.5 font-mono text-xs text-text"
          value={speed}
          onChange={(e) => controller.setSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
        </select>
      </label>

      <Divider />

      <button
        type="button"
        className={iconBtn}
        title={t.toolbar.undo}
        aria-label={t.toolbar.undo}
        disabled={!canUndo}
        onClick={() => store.getState().undo()}
      >
        <Undo2 size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={iconBtn}
        title={t.toolbar.redo}
        aria-label={t.toolbar.redo}
        disabled={!canRedo}
        onClick={() => store.getState().redo()}
      >
        <Redo2 size={17} aria-hidden="true" />
      </button>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className={iconBtn}
          title={t.toolbar.zoomOut}
          aria-label={t.toolbar.zoomOut}
          disabled={zoom <= ZOOM.min}
          onClick={() => store.getState().setZoom(zoom - ZOOM.step)}
        >
          <ZoomOut size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="h-7 min-w-12 rounded-md px-1 font-mono text-xs text-text-muted hover:bg-surface"
          title={t.toolbar.zoomReset}
          onClick={() => store.getState().setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className={iconBtn}
          title={t.toolbar.zoomIn}
          aria-label={t.toolbar.zoomIn}
          disabled={zoom >= ZOOM.max}
          onClick={() => store.getState().setZoom(zoom + ZOOM.step)}
        >
          <ZoomIn size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function FileMenu({ onNew, onExample }: { onNew: () => void; onExample: () => void }) {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const item =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-2';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-text hover:bg-surface"
      >
        {t.toolbar.file}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-1 min-w-64 overflow-hidden rounded-md border border-border bg-bg py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            <FilePlus2 size={15} aria-hidden="true" className="text-text-muted" />
            {t.toolbar.newProject}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onExample();
            }}
          >
            <FileText size={15} aria-hidden="true" className="text-text-muted" />
            {t.toolbar.loadExample}
          </button>
        </div>
      )}
    </div>
  );
}
