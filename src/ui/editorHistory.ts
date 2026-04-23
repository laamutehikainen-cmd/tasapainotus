import type { EditorDocument, EditorSelection } from "./editorState";

export interface EditorSnapshot {
  document: EditorDocument;
  selection: EditorSelection;
}

export interface EditorHistoryState {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

export function createEditorHistoryState(): EditorHistoryState {
  return {
    past: [],
    future: []
  };
}

export function recordEditorHistory(
  history: EditorHistoryState,
  current: EditorSnapshot
): EditorHistoryState {
  return {
    past: [...history.past, current],
    future: []
  };
}

export function undoEditorHistory(
  history: EditorHistoryState,
  current: EditorSnapshot
): {
  history: EditorHistoryState;
  snapshot: EditorSnapshot;
} | null {
  const previous = history.past.at(-1);

  if (!previous) {
    return null;
  }

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future]
    },
    snapshot: previous
  };
}

export function redoEditorHistory(
  history: EditorHistoryState,
  current: EditorSnapshot
): {
  history: EditorHistoryState;
  snapshot: EditorSnapshot;
} | null {
  const next = history.future[0];

  if (!next) {
    return null;
  }

  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(1)
    },
    snapshot: next
  };
}
