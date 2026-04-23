import type {
  AutomaticFittingResult,
  ComponentPerformanceResult
} from "../calc";
import { getAirSystemLabel } from "../airSystems";
import type { NetworkComponent } from "../components";
import type { DuctNode } from "../core/nodes";
import {
  STANDARD_ROUND_DUCT_DIAMETERS_MM,
  normalizeRoundDuctDiameterMm
} from "../data/ductSizes";

interface PropertiesProps {
  selectedComponent: NetworkComponent | null;
  selectedComponentResult: ComponentPerformanceResult | null;
  selectedNode: DuctNode | null;
  selectedNodeFittings: AutomaticFittingResult[];
  onNodeLabelChange: (value: string) => void;
  onComponentLabelChange: (value: string) => void;
  onAhuSystemTypeChange: (value: "supply" | "exhaust" | "mixed") => void;
  onAhuRotationChange: (value: number) => void;
  selectedAhuConnectedDuctCount: number;
  onAhuDimensionChange: (
    dimension: "widthMeters" | "depthMeters" | "heightMeters",
    value: number
  ) => void;
  selectedDuctAirSystemLabel: string | null;
  onTerminalFlowRateChange: (value: number) => void;
  onTerminalTypeChange: (
    value: "supply" | "exhaust" | "outdoor" | "exhaustAir"
  ) => void;
  onDuctDiameterChange: (value: number) => void;
  onDuctLocalLossChange: (value: number) => void;
  onAutomaticFittingLossChange: (
    fitting: AutomaticFittingResult,
    value: number
  ) => void;
  onAutomaticFittingReset: (fitting: AutomaticFittingResult) => void;
}

export function Properties({
  selectedComponent,
  selectedComponentResult,
  selectedNode,
  selectedNodeFittings,
  onNodeLabelChange,
  onComponentLabelChange,
  onAhuSystemTypeChange,
  onAhuRotationChange,
  selectedAhuConnectedDuctCount,
  onAhuDimensionChange,
  selectedDuctAirSystemLabel,
  onTerminalFlowRateChange,
  onTerminalTypeChange,
  onDuctDiameterChange,
  onDuctLocalLossChange,
  onAutomaticFittingLossChange,
  onAutomaticFittingReset
}: PropertiesProps) {
  return (
    <section className="sidebar-section" aria-label="Properties">
      <div className="sidebar-section-header">
        <p className="section-kicker">Selection</p>
        <h3>Properties</h3>
      </div>

      {!selectedComponent && !selectedNode ? (
        <p className="sidebar-empty">
          Select a node or component to inspect and edit its properties.
        </p>
      ) : null}

      {selectedNode ? (
        <div className="property-group">
          <label className="property-field">
            <span>Node label</span>
            <input
              type="text"
              value={selectedNode.metadata.label ?? ""}
              onChange={(event) => onNodeLabelChange(event.target.value)}
            />
          </label>
          <div className="property-meta">
            <span>Node ID</span>
            <strong>{selectedNode.id}</strong>
          </div>
          <div className="property-meta">
            <span>Position</span>
            <strong>
              {selectedNode.position.x.toFixed(1)} m, {selectedNode.position.y.toFixed(1)} m
            </strong>
          </div>
          {selectedNodeFittings.length > 0 ? (
            <div className="property-fitting-list">
              {selectedNodeFittings.map((fitting) => (
                <div key={fitting.id} className="property-fitting-card">
                  <div className="property-meta">
                    <span>{formatFittingType(fitting.fittingType)}</span>
                    <strong>{fitting.downstreamComponentLabel}</strong>
                  </div>
                  <label className="property-field">
                    <span>Zeta</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fitting.lossCoefficient}
                      onChange={(event) =>
                        onAutomaticFittingLossChange(
                          fitting,
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>
                  <div className="property-metric-grid">
                    <div className="property-meta">
                      <span>Default zeta</span>
                      <strong>{fitting.defaultLossCoefficient.toFixed(2)}</strong>
                    </div>
                    <div className="property-meta">
                      <span>Pressure loss</span>
                      <strong>{formatPressure(fitting.pressureLossPa)}</strong>
                    </div>
                    <div className="property-meta">
                      <span>Flow</span>
                      <strong>{formatFlow(fitting.flowRateLps)}</strong>
                    </div>
                    <div className="property-meta">
                      <span>Velocity</span>
                      <strong>{formatVelocity(fitting.velocityMps)}</strong>
                    </div>
                  </div>
                  {fitting.manualOverrideApplied ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => onAutomaticFittingReset(fitting)}
                    >
                      Reset to auto value
                    </button>
                  ) : (
                    <p className="property-help">
                      Auto-generated {formatFittingType(fitting.fittingType).toLowerCase()} loss.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedComponent?.type === "ahu" ? (
        <div className="property-group">
          <label className="property-field">
            <span>Label</span>
            <input
              type="text"
              value={selectedComponent.metadata.label}
              onChange={(event) => onComponentLabelChange(event.target.value)}
            />
          </label>
          <label className="property-field">
            <span>System type</span>
            <select
              value={selectedComponent.metadata.systemType}
              onChange={(event) =>
                onAhuSystemTypeChange(
                  event.target.value as "supply" | "exhaust" | "mixed"
                )
              }
            >
              <option value="supply">Supply</option>
              <option value="exhaust">Extract air</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <div className="property-meta">
            <span>Rotation</span>
            <strong>{selectedComponent.metadata.rotationDegrees} deg</strong>
          </div>
          <div className="tool-panel-actions">
            <button
              className="ghost-button"
              type="button"
              disabled={selectedAhuConnectedDuctCount > 0}
              onClick={() =>
                onAhuRotationChange(selectedComponent.metadata.rotationDegrees - 90)
              }
            >
              Rotate -90
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={selectedAhuConnectedDuctCount > 0}
              onClick={() =>
                onAhuRotationChange(selectedComponent.metadata.rotationDegrees + 90)
              }
            >
              Rotate +90
            </button>
          </div>
          <label className="property-field">
            <span>Rotation (deg)</span>
            <input
              type="number"
              step="90"
              value={selectedComponent.metadata.rotationDegrees}
              disabled={selectedAhuConnectedDuctCount > 0}
              onChange={(event) =>
                onAhuRotationChange(Number(event.target.value))
              }
            />
          </label>
          {selectedAhuConnectedDuctCount > 0 ? (
            <p className="property-help">
              Rotation is locked after ducts are connected to the AHU ports.
            </p>
          ) : (
            <p className="property-help">
              Rotate the AHU before connecting ducts so the fixed ports face the right directions.
            </p>
          )}
          <div className="property-metric-grid">
            <label className="property-field">
              <span>Length (m)</span>
              <input
                type="number"
                min="0.2"
                step="0.1"
                value={selectedComponent.geometry.widthMeters}
                onChange={(event) =>
                  onAhuDimensionChange(
                    "widthMeters",
                    Number(event.target.value)
                  )
                }
              />
            </label>
            <label className="property-field">
              <span>Width (m)</span>
              <input
                type="number"
                min="0.2"
                step="0.1"
                value={selectedComponent.geometry.depthMeters}
                onChange={(event) =>
                  onAhuDimensionChange(
                    "depthMeters",
                    Number(event.target.value)
                  )
                }
              />
            </label>
            <label className="property-field">
              <span>Height (m)</span>
              <input
                type="number"
                min="0.2"
                step="0.1"
                value={selectedComponent.geometry.heightMeters}
                onChange={(event) =>
                  onAhuDimensionChange(
                    "heightMeters",
                    Number(event.target.value)
                  )
                }
              />
            </label>
          </div>
        </div>
      ) : null}

      {selectedComponent?.type === "terminal" ? (
        <div className="property-group">
          <label className="property-field">
            <span>Label</span>
            <input
              type="text"
              value={selectedComponent.metadata.label}
              onChange={(event) => onComponentLabelChange(event.target.value)}
            />
          </label>
          <label className="property-field">
            <span>Terminal type</span>
            <select
              value={selectedComponent.metadata.terminalType}
              onChange={(event) =>
                onTerminalTypeChange(
                  event.target.value as
                    | "supply"
                    | "exhaust"
                    | "outdoor"
                    | "exhaustAir"
                )
              }
            >
              <option value="supply">Supply</option>
              <option value="exhaust">Extract air</option>
              <option value="outdoor">Outdoor air</option>
              <option value="exhaustAir">Exhaust</option>
            </select>
          </label>
          {selectedComponent.metadata.terminalType === "supply" ||
          selectedComponent.metadata.terminalType === "exhaust" ? (
            <label className="property-field">
              <span>Design flow (L/s)</span>
              <input
                type="number"
                min="1"
                step="10"
                value={selectedComponent.flow.designFlowRateLps ?? 0}
                onChange={(event) =>
                  onTerminalFlowRateChange(Number(event.target.value))
                }
              />
            </label>
          ) : (
            <div className="property-meta">
              <span>Auto flow</span>
              <strong>{(selectedComponent.flow.designFlowRateLps ?? 0).toFixed(0)} L/s</strong>
            </div>
          )}
          {selectedComponent.metadata.terminalType === "outdoor" ? (
            <p className="property-help">
              Outdoor air flow follows the sum of all supply terminals.
            </p>
          ) : null}
          {selectedComponent.metadata.terminalType === "exhaustAir" ? (
            <p className="property-help">
              Exhaust flow follows the sum of all extract air terminals.
            </p>
          ) : null}
        </div>
      ) : null}

      {selectedComponent?.type === "ductSegment" ? (
        <div className="property-group">
          <label className="property-field">
            <span>Label</span>
            <input
              type="text"
              value={selectedComponent.metadata.label ?? ""}
              onChange={(event) => onComponentLabelChange(event.target.value)}
            />
          </label>
          <label className="property-field">
            <span>Round duct size (mm)</span>
            <select
              value={normalizeRoundDuctDiameterMm(selectedComponent.geometry.diameterMm)}
              onChange={(event) =>
                onDuctDiameterChange(Number(event.target.value))
              }
            >
              {STANDARD_ROUND_DUCT_DIAMETERS_MM.map((diameterMm) => (
                <option key={diameterMm} value={diameterMm}>
                  {diameterMm}
                </option>
              ))}
            </select>
          </label>
          <label className="property-field">
            <span>Local loss coefficient</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={selectedComponent.metadata.localLossCoefficient}
              onChange={(event) =>
                onDuctLocalLossChange(Number(event.target.value))
              }
            />
          </label>
          <div className="property-meta">
            <span>Length</span>
            <strong>{selectedComponent.geometry.lengthMeters.toFixed(2)} m</strong>
          </div>
          <div className="property-meta">
            <span>Air system</span>
            <strong>{selectedDuctAirSystemLabel ?? "Unassigned"}</strong>
          </div>
          {selectedComponent.metadata.ahuConnection ? (
            <div className="property-meta">
              <span>AHU port</span>
              <strong>{getAirSystemLabel(selectedComponent.metadata.ahuConnection.portType)}</strong>
            </div>
          ) : null}
          <div className="property-metric-grid">
            <div className="property-meta">
              <span>Flow</span>
              <strong>{formatFlow(selectedComponentResult?.flowRateLps)}</strong>
            </div>
            <div className="property-meta">
              <span>Velocity</span>
              <strong>{formatVelocity(selectedComponentResult?.velocityMps)}</strong>
            </div>
            <div className="property-meta">
              <span>R (Pa/m)</span>
              <strong>
                {formatPerMeterPressure(
                  selectedComponentResult?.totalPressureLossPa,
                  selectedComponent.geometry.lengthMeters
                )}
              </strong>
            </div>
            <div className="property-meta">
              <span>Total pressure loss</span>
              <strong>{formatPressure(selectedComponentResult?.totalPressureLossPa)}</strong>
            </div>
            <div className="property-meta">
              <span>Friction loss</span>
              <strong>{formatPressure(selectedComponentResult?.frictionPressureLossPa)}</strong>
            </div>
            <div className="property-meta">
              <span>Local loss</span>
              <strong>{formatPressure(selectedComponentResult?.localPressureLossPa)}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatFlow(value: number | null | undefined): string {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(0)} L/s`;
}

function formatVelocity(value: number | null | undefined): string {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(2)} m/s`;
}

function formatPressure(value: number | null | undefined): string {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(2)} Pa`;
}

function formatPerMeterPressure(
  pressureLossPa: number | null | undefined,
  lengthMeters: number
): string {
  if (
    pressureLossPa === null ||
    pressureLossPa === undefined ||
    !Number.isFinite(lengthMeters) ||
    lengthMeters <= 0
  ) {
    return "N/A";
  }

  return `${(pressureLossPa / lengthMeters).toFixed(2)} Pa/m`;
}

function formatFittingType(value: AutomaticFittingResult["fittingType"]): string {
  switch (value) {
    case "elbow":
      return "Elbow";
    case "tee":
      return "Tee";
  }
}
