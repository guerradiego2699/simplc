/**
 * File-related UI: autosave (debounced, flushed when the tab is hidden), drag-and-drop of a
 * project file onto the simulator, and the notice banner (file opened / file errors).
 */
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, FileUp, X } from 'lucide-react';
import { saveAutosave } from '@/simulator/file/autosave';
import { useController, useSim, useStoreApi, useStrings } from './context';
import { openProjectFile } from './file-actions';

const AUTOSAVE_DELAY_MS = 400;
const INFO_NOTICE_MS = 4000;

/** Saves the project in the browser shortly after every change. Renders nothing. */
export function Autosave() {
  const store = useStoreApi();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      timer = undefined;
      store.setState({ autosave: saveAutosave(store.getState().project) });
    };
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      clearTimeout(timer);
      timer = setTimeout(save, AUTOSAVE_DELAY_MS);
    });
    // Leaving or hiding the tab: save pending changes right away.
    const flush = () => {
      if (timer !== undefined) save();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    save(); // record the initial state (and detect blocked storage early)
    return () => {
      flush();
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [store]);
  return null;
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

/** Accepts a project file dropped anywhere on the simulator. */
export function FileDropZone({ children }: { children: ReactNode }) {
  const t = useStrings();
  const store = useStoreApi();
  const controller = useController();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className="relative h-full"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        depth.current++;
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void openProjectFile(file, store, controller, t);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-bg/85">
          <p className="flex items-center gap-2 text-base font-semibold text-primary">
            <FileUp size={22} aria-hidden="true" />
            {t.file.dropHere}
          </p>
        </div>
      )}
    </div>
  );
}

/** Message over the editor; informational ones disappear by themselves. */
export function NoticeBanner() {
  const t = useStrings();
  const store = useStoreApi();
  const notice = useSim((s) => s.notice);

  useEffect(() => {
    if (!notice || notice.kind !== 'info') return;
    const timer = setTimeout(() => {
      if (store.getState().notice?.id === notice.id) store.getState().setNotice(null);
    }, INFO_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, store]);

  if (!notice) return null;
  const error = notice.kind === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      data-testid="notice"
      data-kind={notice.kind}
      className={`absolute top-3 left-1/2 z-30 flex max-w-[90%] -translate-x-1/2 items-start gap-2 rounded-md border bg-bg px-3 py-2 text-sm text-text shadow-lg ${
        error ? 'border-danger' : 'border-border'
      }`}
    >
      {error ? (
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <CircleCheck size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      )}
      <span>{notice.text}</span>
      <button
        type="button"
        aria-label={t.file.close}
        className="ml-1 rounded p-0.5 text-text-muted hover:bg-surface-2 hover:text-text"
        onClick={() => store.getState().setNotice(null)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
