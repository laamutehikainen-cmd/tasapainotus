import { createInitialEditorDocument, type EditorSelection } from "./editorState";
import {
  createEditorHistoryState,
  recordEditorHistory,
  redoEditorHistory,
  undoEditorHistory
} from "./editorHistory";

describe("editorHistory", () => {
  it("undoes to the previous snapshot and moves the current state into future", () => {
    const selection: EditorSelection = {
      kind: "component",
      id: "duct-3"
    };
    const initialDocument = createInitialEditorDocument();
    const nextDocument = {
      ...createInitialEditorDocument(),
      nextSequence: 4
    };
    const history = recordEditorHistory(createEditorHistoryState(), {
      document: initialDocument,
      selection: null
    });

    const result = undoEditorHistory(history, {
      document: nextDocument,
      selection
    });

    expect(result).not.toBeNull();
    expect(result?.snapshot.document).toEqual(initialDocument);
    expect(result?.snapshot.selection).toBeNull();
    expect(result?.history.past).toHaveLength(0);
    expect(result?.history.future).toHaveLength(1);
    expect(result?.history.future[0].selection).toEqual(selection);
  });

  it("redoes the next snapshot and restores the current snapshot back into past", () => {
    const initialDocument = createInitialEditorDocument();
    const nextDocument = {
      ...createInitialEditorDocument(),
      nextSequence: 5
    };
    const undoResult = undoEditorHistory(
      recordEditorHistory(createEditorHistoryState(), {
        document: initialDocument,
        selection: null
      }),
      {
        document: nextDocument,
        selection: {
          kind: "component",
          id: "duct-4"
        }
      }
    );

    expect(undoResult).not.toBeNull();

    const redoResult = redoEditorHistory(undoResult!.history, undoResult!.snapshot);

    expect(redoResult).not.toBeNull();
    expect(redoResult?.snapshot.document).toEqual(nextDocument);
    expect(redoResult?.history.past).toHaveLength(1);
    expect(redoResult?.history.future).toHaveLength(0);
  });
});
