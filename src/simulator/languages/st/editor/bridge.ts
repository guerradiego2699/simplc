/**
 * Small bridge between the lazily-loaded ST editor and the rest of the UI (snippet panel):
 * the editor registers itself here when mounted.
 */
export interface StEditorHandle {
  /** Inserts a Monaco snippet ("IF ${1:x} THEN …") at the cursor and focuses the editor. */
  insertSnippet(snippet: string): void;
}

let current: StEditorHandle | null = null;

export const stEditorBridge = {
  get current() {
    return current;
  },
  set(handle: StEditorHandle | null) {
    current = handle;
  },
};
