import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FolderOpen,
  FilePlus2,
  FileText,
  Pause,
  Play,
  Redo2,
  Footprints,
  SkipForward,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { emptyProject, motorStartStopProject } from '@/simulator/project/examples';
import { SPEEDS, ZOOM } from '@/simulator/store/simulator-store';
import { ADDRESS_STYLES, type AddressStyle } from '@/simulator/addressing/styles';
import type { Language } from '@/simulator/project/types';
import { useController, useSim, useStoreApi, useStrings } from './context';
import { downloadProject, openProjectFile } from './file-actions';

const LANGUAGES: Language[] = ['LD', 'ST', 'FBD', 'IL', 'SFC'];

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-md text-text hover:bg-surface disabled:opacity-35 disabled:hover:bg-transparent';

export function Toolbar() {
  const t = useStrings();
  const store = useStoreApi();
  const controller = useController();
  const { status, speed, canUndo, canRedo, zoom, language, style, visualizing } = useSim(
    useShallow((s) => ({
      status: s.status,
      speed: s.speed,
      canUndo: s.past.length > 0,
      canRedo: s.future.length > 0,
      zoom: s.zoom,
      language: s.project.language,
      style: s.addressStyle,
      visualizing: s.scanView.active,
    })),
  );

  const replace = (next: ReturnType<typeof emptyProject>) => {
    if (!window.confirm(t.toolbar.confirmDiscard)) return;
    controller.stop();
    store.getState().replaceProject(next);
  };
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div
      role="toolbar"
      aria-label={t.toolbar.label}
      className="flex h-11 items-center gap-1 border-b border-border bg-surface-2 px-2"
    >
      <FileMenu
        items={[
          { label: t.toolbar.newProject, Icon: FilePlus2, onSelect: () => replace(emptyProject()) },
          {
            label: t.toolbar.open,
            Icon: FolderOpen,
            testId: 'menu-open',
            onSelect: () => fileInput.current?.click(),
          },
          {
            label: t.toolbar.download,
            Icon: Download,
            testId: 'menu-download',
            onSelect: () => downloadProject(store, t),
          },
          {
            label: t.toolbar.loadExample,
            Icon: FileText,
            onSelect: () => replace(motorStartStopProject(t.example)),
          },
        ]}
      />
      <input
        ref={fileInput}
        id="project-file-input"
        data-testid="project-file-input"
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openProjectFile(file, store, controller, t);
        }}
      />
      <ProjectName />

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
      <button
        type="button"
        className={`${iconBtn} aria-pressed:bg-primary/15 aria-pressed:text-primary`}
        title={t.toolbar.visualize}
        aria-label={t.toolbar.visualize}
        aria-pressed={visualizing}
        data-testid="visualize-scan"
        onClick={() => (visualizing ? controller.exitVisualize() : controller.visualize())}
      >
        <Footprints size={17} aria-hidden="true" />
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

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        {t.toolbar.addressStyle}
        <select
          data-testid="address-style"
          className="h-7 rounded-md border border-border bg-bg px-1.5 text-xs text-text"
          value={style}
          onChange={(e) => store.getState().setAddressStyle(e.target.value as AddressStyle)}
        >
          {ADDRESS_STYLES.map((s) => (
            <option key={s} value={s}>
              {t.styles[s]}
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

interface MenuItem {
  label: string;
  Icon: typeof FileText;
  onSelect: () => void;
  testId?: string;
}

function FileMenu({ items }: { items: MenuItem[] }) {
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
          {items.map(({ label, Icon, onSelect, testId }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              data-testid={testId}
              className={item}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              <Icon size={15} aria-hidden="true" className="text-text-muted" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editable project name (also used as the download file name). */
function ProjectName() {
  const t = useStrings();
  const store = useStoreApi();
  const name = useSim((s) => s.project.name);
  return (
    <input
      aria-label={t.toolbar.projectName}
      title={t.toolbar.projectName}
      data-testid="project-name"
      value={name}
      placeholder={t.toolbar.untitled}
      maxLength={100}
      spellCheck={false}
      onChange={(e) =>
        store.getState().commit((p) => ({ ...p, name: e.target.value }), 'project-name')
      }
      className="h-7 w-44 min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-text placeholder:text-text-muted hover:border-border focus:border-primary focus:bg-bg focus:outline-none"
    />
  );
}
