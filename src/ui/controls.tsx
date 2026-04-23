import type { ToolMode } from "./editorState";

interface ToolbarButton {
  tool: ToolMode;
  label: string;
  hint: string;
}

const toolbarButtons: ToolbarButton[] = [
  {
    tool: "select",
    label: "Select",
    hint: "Pick components, nodes, and properties."
  },
  {
    tool: "duct",
    label: "Draw duct",
    hint: "Click two snapped points to create a straight duct."
  },
  {
    tool: "ahu",
    label: "Place AHU",
    hint: "Place the single air handling unit."
  },
  {
    tool: "supplyTerminal",
    label: "Supply",
    hint: "Place a supply terminal."
  },
  {
    tool: "exhaustTerminal",
    label: "Extract air",
    hint: "Place an extract air terminal."
  },
  {
    tool: "outdoorTerminal",
    label: "Outdoor",
    hint: "Place an outdoor air terminal."
  },
  {
    tool: "exhaustAirTerminal",
    label: "Exhaust air",
    hint: "Place an exhaust air terminal."
  }
];

interface ControlsProps {
  activeTool: ToolMode;
  hasSelection: boolean;
  ductDraftActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
  onCancelDuctDraft: () => void;
}

export function Controls({
  activeTool,
  hasSelection,
  ductDraftActive,
  canUndo,
  canRedo,
  onSelectTool,
  onUndo,
  onRedo,
  onDeleteSelection,
  onCancelDuctDraft
}: ControlsProps) {
  return (
    <section className="tool-panel" aria-label="Editor tools">
      <div className="tool-panel-header">
        <div>
          <p className="section-kicker">Phase 8</p>
          <h2>Editing Workflow</h2>
        </div>
        <div className="tool-panel-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
          >
            Redo
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onDeleteSelection}
            disabled={!hasSelection}
          >
            Delete selection
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onCancelDuctDraft}
            disabled={!ductDraftActive}
          >
            Cancel duct
          </button>
        </div>
      </div>

      <div className="tool-grid">
        {toolbarButtons.map((button) => (
          <button
            key={button.tool}
            className={
              activeTool === button.tool
                ? "tool-button is-active"
                : "tool-button"
            }
            type="button"
            onClick={() => onSelectTool(button.tool)}
          >
            <strong>{button.label}</strong>
            <span>{button.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
