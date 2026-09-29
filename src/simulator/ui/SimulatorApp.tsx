import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Locale } from '@/config/site';
import { IoBoard } from '@/simulator/io-panel/IoBoard';
import { LadderEditor } from '@/simulator/languages/ladder/editor/LadderEditor';
import { Palette } from '@/simulator/languages/ladder/editor/Palette';
import { InstructionIcon } from '@/simulator/languages/ladder/editor/symbols';
import { motorStartStopProject } from '@/simulator/project/examples';
import { SimulationController } from '@/simulator/store/controller';
import {
  createSimulatorStore,
  type BottomTab,
  type RightTab,
  type SimulatorStoreApi,
} from '@/simulator/store/simulator-store';
import { ConsolePanel } from './ConsolePanel';
import {
  fmt,
  SimProvider,
  useController,
  useSim,
  useStoreApi,
  useStrings,
  type SimStrings,
} from './context';
import { MonitorPanel } from './MonitorPanel';
import { PlantPanel } from './PlantPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ScanPanel } from './ScanPanel';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { VariablesPanel } from './VariablesPanel';
import { Autosave, FileDropZone, NoticeBanner } from './FileSupport';
import { downloadProject } from './file-actions';
import { loadAutosave } from '@/simulator/file/autosave';
import { exampleProject, getExample } from '@/simulator/examples';

interface Props {
  strings: SimStrings;
  locale: Locale;
}

export default function SimulatorApp({ strings, locale }: Props) {
  // One store + controller per page load.
  const [value] = useState(() => {
    // Continue where the user left off (autosave), or start with the example.
    const store = createSimulatorStore(loadAutosave() ?? motorStartStopProject(strings.example));
    openRequestedExample(store, strings, locale);
    return { store, controller: new SimulationController(store), t: strings, locale };
  });

  useEffect(() => () => value.controller.dispose(), [value]);

  return (
    <SimProvider value={value}>
      <Shortcuts />
      <Autosave />
      <FileDropZone>
        <Workspace />
      </FileDropZone>
      <DragGhost />
    </SimProvider>
  );
}

/**
 * `/simulator?example=<id>` (from the example pages) opens that example. It replaces the saved
 * project as an undoable change, and the parameter is dropped so a reload keeps the user's edits.
 */
function openRequestedExample(store: SimulatorStoreApi, t: SimStrings, locale: Locale) {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('example');
  if (id === null) return;
  url.searchParams.delete('example');
  window.history.replaceState(window.history.state, '', url);
  const example = getExample(id);
  if (!example) return;
  const project = exampleProject(example, locale);
  store.getState().replaceProject(project);
  store.getState().setLayout({ bottomTab: project.plant ? 'plant' : 'io' });
  store.getState().setNotice({
    kind: 'info',
    text: fmt(t.file.exampleLoaded, { name: project.name }),
    id: Date.now(),
  });
}

function Workspace() {
  const t = useStrings();
  const store = useStoreApi();
  const { rightWidth, bottomHeight, rightTab, bottomTab } = useSim(
    useShallow((s) => ({
      rightWidth: s.rightWidth,
      bottomHeight: s.bottomHeight,
      rightTab: s.rightTab,
      bottomTab: s.bottomTab,
    })),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text" data-testid="simulator">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div className="w-52 shrink-0">
          <Palette />
        </div>
        <main className="relative min-w-0 flex-1">
          <LadderEditor />
          <NoticeBanner />
        </main>
        <Resizer
          orientation="vertical"
          label={t.properties.title}
          onDrag={(dx) =>
            store
              .getState()
              .setLayout({ rightWidth: clamp(store.getState().rightWidth - dx, 240, 560) })
          }
        />
        <aside
          className="flex shrink-0 flex-col border-l border-border bg-surface"
          style={{ width: rightWidth }}
        >
          <Tabs<RightTab>
            value={rightTab}
            onChange={(v) => store.getState().setLayout({ rightTab: v })}
            tabs={[
              { id: 'properties', label: t.properties.title, content: <PropertiesPanel /> },
              { id: 'variables', label: t.variables.title, content: <VariablesPanel /> },
              { id: 'monitor', label: t.monitor.title, content: <MonitorPanel /> },
            ]}
          />
        </aside>
      </div>
      <Resizer
        orientation="horizontal"
        label={t.io.title}
        onDrag={(_, dy) =>
          store
            .getState()
            .setLayout({ bottomHeight: clamp(store.getState().bottomHeight - dy, 120, 420) })
        }
      />
      <section
        className="flex shrink-0 flex-col border-t border-border bg-surface"
        style={{ height: bottomHeight }}
      >
        <Tabs<BottomTab>
          value={bottomTab}
          onChange={(v) => store.getState().setLayout({ bottomTab: v })}
          tabs={[
            { id: 'io', label: t.io.title, content: <IoBoard /> },
            { id: 'console', label: t.console.title, content: <ConsolePanel /> },
            { id: 'scan', label: t.scan.title, content: <ScanPanel /> },
            { id: 'plant', label: t.plant.title, content: <PlantPanel /> },
          ]}
        />
      </section>
      <StatusBar />
    </div>
  );
}

function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string; content: ReactNode }[];
}) {
  const active = tabs.find((tab) => tab.id === value) ?? tabs[0];
  return (
    <>
      <div
        role="tablist"
        className="flex h-8 shrink-0 items-end gap-0.5 border-b border-border px-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === value}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className="-mb-px rounded-t-md border border-transparent px-3 py-1 text-xs font-medium text-text-muted hover:text-text aria-selected:border-border aria-selected:border-b-surface aria-selected:bg-surface aria-selected:text-text"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${active?.id}`}
        aria-labelledby={`tab-${active?.id}`}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {active?.content}
      </div>
    </>
  );
}

function Resizer({
  orientation,
  label,
  onDrag,
}: {
  orientation: 'vertical' | 'horizontal';
  label: string;
  onDrag: (dx: number, dy: number) => void;
}) {
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    let lastX = e.clientX;
    let lastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      onDrag(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const vertical = orientation === 'vertical';
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      onPointerDown={start}
      className={`shrink-0 bg-border/0 transition-colors hover:bg-primary/40 ${vertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}`}
    />
  );
}

/** Shows what is being dragged next to the pointer. */
function DragGhost() {
  const t = useStrings();
  const drag = useSim((s) => s.drag);
  if (!drag) return null;
  const item = drag.item;
  const colors = { left: 'var(--primary)', right: 'var(--primary)', body: 'var(--primary)' };
  const label =
    item.source === 'palette'
      ? t.elements[item.type]
      : item.kind === 'parallel'
        ? t.elements.parallel
        : '';
  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border border-primary bg-bg/95 px-2 py-1 text-xs text-text shadow-lg"
      style={{ left: drag.x + 14, top: drag.y + 10 }}
    >
      {item.source === 'palette' && (
        <svg width={48} height={30} viewBox="0 0 72 44" aria-hidden="true">
          <InstructionIcon type={item.type} w={72} h={44} colors={colors} />
        </svg>
      )}
      {label}
    </div>
  );
}

/** Keyboard shortcuts (spec 6.1). Typing in fields keeps native behaviour. */
function Shortcuts() {
  const t = useStrings();
  const store = useStoreApi();
  const controller = useController();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        controller.run();
        return;
      }
      if (e.key === 'F6') {
        e.preventDefault();
        controller.stop();
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        controller.step();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Ctrl+S / Ctrl+O work everywhere (the browser's own save/open would be confusing here).
      if (ctrl && key === 's') {
        e.preventDefault();
        downloadProject(store, t);
        return;
      }
      if (ctrl && key === 'o') {
        e.preventDefault();
        document.getElementById('project-file-input')?.click();
        return;
      }
      if (isTyping(e.target)) return;
      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.getState().undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        store.getState().redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.getState().selection) {
          e.preventDefault();
          store.getState().deleteSelection();
        }
      } else if (e.key === 'Escape') {
        store.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, controller, t]);
  return null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type { SimulatorStoreApi };
