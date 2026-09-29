/**
 * Autosave of the current project in localStorage (spec 6.8). Uses the same format and
 * validation as downloaded files. Every access is wrapped in try/catch: storage may be full,
 * blocked (private mode, policies) or unavailable, and the simulator must keep working.
 */
import type { Project } from '@/simulator/project/types';
import { parseProjectFile, serializeProject } from './project-file';

export const AUTOSAVE_KEY = 'plcampus:project';

export type AutosaveStatus = 'saved' | 'unavailable';

/** Saves the project. Returns 'unavailable' if storage could not be written. */
export function saveAutosave(project: Project): AutosaveStatus {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** The saved project, or null if there is none, it is invalid or storage is blocked. */
export function loadAutosave(): Project | null {
  try {
    const content = localStorage.getItem(AUTOSAVE_KEY);
    if (!content) return null;
    const result = parseProjectFile(content);
    return result.ok ? result.project : null;
  } catch {
    return null;
  }
}
