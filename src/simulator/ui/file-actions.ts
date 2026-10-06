/**
 * Download / open project files from the UI (browser APIs live here, not in the pure file module).
 */
import { SITE } from '@/config/site';
import { ladderToSt } from '@/simulator/languages/st/from-ladder';
import { ladderToIl } from '@/simulator/languages/il/from-ladder';
import {
  FILE_EXTENSION,
  fileNameFor,
  parseProjectFile,
  serializeProject,
  type ParseError,
} from '@/simulator/file/project-file';
import type { SimulationController } from '@/simulator/store/controller';
import type { SimulatorStoreApi } from '@/simulator/store/simulator-store';
import { fmt, type SimStrings } from './context';

const notify = (store: SimulatorStoreApi, kind: 'info' | 'error', text: string) =>
  store.getState().setNotice({ kind, text, id: Date.now() });

export function fileErrorMessage(
  error: ParseError | { code: 'READ_ERROR' },
  t: SimStrings,
): string {
  const template = t.file.errors[error.code];
  return fmt(template, {
    site: SITE.name,
    version: 'version' in error ? error.version : '',
    path: 'path' in error ? error.path : '',
  });
}

/** Saves the current project to the user's computer as <name>.plcampus.json. */
export function downloadProject(store: SimulatorStoreApi, t: SimStrings): void {
  const project = store.getState().project;
  const fileName = fileNameFor(project.name, t.file.fallbackName);
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(store, 'info', fmt(t.file.downloaded, { file: fileName }));
}

/** Opens a project file chosen or dropped by the user (validates it first). */
export async function openProjectFile(
  file: File,
  store: SimulatorStoreApi,
  controller: SimulationController,
  t: SimStrings,
): Promise<void> {
  let content: string;
  try {
    content = await file.text();
  } catch {
    notify(store, 'error', fileErrorMessage({ code: 'READ_ERROR' }, t));
    return;
  }
  const result = parseProjectFile(content);
  if (!result.ok) {
    notify(store, 'error', fileErrorMessage(result.error, t));
    return;
  }
  controller.stop();
  store.getState().replaceProject(result.project);
  notify(store, 'info', fmt(t.file.loaded, { name: result.project.name || t.toolbar.untitled }));
}

/** The program as Structured Text: the ST source, or the conversion of the Ladder program. */
export function stSourceOf(store: SimulatorStoreApi, t: SimStrings): string {
  const { project } = store.getState();
  if (project.language === 'ST') return project.st ?? '';
  return ladderToSt(project.ladder, project.tags, {
    header: fmt(t.st.header, { name: project.name || t.toolbar.untitled }),
    rung: t.st.rung,
    rungVariable: t.st.rungVariable,
  });
}

/** The program as Instruction List: the IL source, or the conversion of the Ladder program. */
export function ilSourceOf(store: SimulatorStoreApi, t: SimStrings): string {
  const { project } = store.getState();
  if (project.language === 'IL') return project.il ?? '';
  return ladderToIl(project.ladder, project.tags, {
    header: fmt(t.st.header, { name: project.name || t.toolbar.untitled }),
    rung: t.st.rung,
    rungVariable: t.st.rungVariable,
  });
}

/** Downloads the program as text: .st (ST, or Ladder converted) or .il (IL source). */
export function exportSt(store: SimulatorStoreApi, t: SimStrings, kind: 'st' | 'il' = 'st'): void {
  const project = store.getState().project;
  const fileName = fileNameFor(project.name, t.file.fallbackName).replace(
    FILE_EXTENSION,
    '.' + kind,
  );
  const text = kind === 'il' ? ilSourceOf(store, t) : stSourceOf(store, t);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(store, 'info', fmt(t.file.exported, { file: fileName }));
}
