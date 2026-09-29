/**
 * Challenge progress, kept only in this browser (no accounts). Storage may be empty or blocked:
 * every access is wrapped and the app works without it.
 */
export const PROGRESS_KEY = 'plcampus:challenges';

export interface Progress {
  /** Challenge id → ISO date when it was first passed. */
  completed: Record<string, string>;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    const completed = (data as Progress | null)?.completed;
    if (completed && typeof completed === 'object') {
      return {
        completed: Object.fromEntries(
          Object.entries(completed).filter(([, v]) => typeof v === 'string'),
        ),
      };
    }
  } catch {
    // Blocked or corrupted storage: start empty.
  }
  return { completed: {} };
}

/** Marks a challenge as completed (keeps the first date). Returns the new progress. */
export function markCompleted(id: string, now = new Date()): Progress {
  const progress = loadProgress();
  if (!progress.completed[id]) progress.completed[id] = now.toISOString();
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked: progress lasts only for this page view.
  }
  return progress;
}
