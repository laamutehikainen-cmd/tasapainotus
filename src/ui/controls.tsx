import type { TerminalDeviceType } from "../components";
import { STANDARD_ROUND_DUCT_DIAMETERS_MM } from "../data/ductSizes";
import type { ToolMode } from "./editorState";
import type { EditorSettings } from "./editorState";

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
  settings: EditorSettings;
  onSelectTool: (tool: ToolMode) => void;
  onActiveDuctDiameterChange: (value: number) => void;
  onDefaultTerminalReferencePressureLossChange: (
    terminalType: TerminalDeviceType,
    value: number
  ) => void;
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
  settings,
  onSelectTool,
  onActiveDuctDiameterChange,
  onDefaultTerminalReferencePressureLossChange,
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

      <div className="property-metric-grid" aria-label="Draft defaults">
        <label className="property-field">
          <span>Next duct size (mm)</span>
          <select
            value={settings.activeDuctDiameterMm}
            onChange={(event) =>
              onActiveDuctDiameterChange(Number(event.target.value))
            }
          >
            {STANDARD_ROUND_DUCT_DIAMETERS_MM.map((diameterMm) => (
              <option key={diameterMm} value={diameterMm}>
                {diameterMm}
              </option>
            ))}
          </select>
        </label>
        {terminalDefaultFields.map((field) => (
          <label key={field.terminalType} className="property-field">
            <span>{field.label} default Pa</span>
            <input
              type="number"
              min="1"
              step="1"
              value={
                settings.defaultTerminalReferencePressureLossPa[field.terminalType]
              }
              onChange={(event) =>
                onDefaultTerminalReferencePressureLossChange(
                  field.terminalType,
                  Number(event.target.value)
                )
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

const terminalDefaultFields: Array<{
  terminalType: TerminalDeviceType;
  label: string;
}> = [
  { terminalType: "supply", label: "Supply" },
  { terminalType: "exhaust", label: "Extract" },
  { terminalType: "outdoor", label: "Outdoor" },
  { terminalType: "exhaustAir", label: "Exhaust" }
];
