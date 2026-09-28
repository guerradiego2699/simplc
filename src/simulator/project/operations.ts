/**
 * Project-level edits that touch several parts at once (tags + program).
 */
import { allElements, updateElement } from '@/simulator/languages/ladder/model';
import type { Project, Tag } from './types';

/** Renames a tag and updates every element that referenced it by its old name. */
export function renameTag(project: Project, tagId: string, name: string): Project {
  const old = project.tags.find((t) => t.id === tagId);
  if (!old) return project;
  const oldKey = old.name.trim().toUpperCase();
  let ladder = project.ladder;
  if (oldKey !== '' && name.trim() !== '') {
    for (const el of allElements(ladder)) {
      if (el.operand.trim().toUpperCase() === oldKey)
        ladder = updateElement(ladder, el.id, { operand: name });
    }
  }
  return {
    ...project,
    ladder,
    tags: project.tags.map((t) => (t.id === tagId ? { ...t, name } : t)),
  };
}

export function updateTag(
  project: Project,
  tagId: string,
  patch: Partial<Omit<Tag, 'id' | 'name'>>,
): Project {
  return { ...project, tags: project.tags.map((t) => (t.id === tagId ? { ...t, ...patch } : t)) };
}

export function removeTag(project: Project, tagId: string): Project {
  return { ...project, tags: project.tags.filter((t) => t.id !== tagId) };
}
