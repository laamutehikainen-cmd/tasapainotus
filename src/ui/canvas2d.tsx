import type { NetworkComponent } from "../components";
import type { Point3D } from "../core/geometry";
import type { DuctNode } from "../core/nodes";
import { GRID_STEP_METERS } from "../core/snapping";
import type {
  DuctDraft,
  EditorDocument,
  EditorSelection,
  ToolMode
} from "./editorState";

const CANVAS_SCALE_PX_PER_METER = 92;
const CANVAS_WIDTH_METERS = 12;
const CANVAS_HEIGHT_METERS = 7.4;
const CANVAS_PADDING_PX = 46;
const VIEW_BOX_WIDTH =
  CANVAS_WIDTH_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2;
const VIEW_BOX_HEIGHT =
  CANVAS_HEIGHT_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2;

interface Canvas2DProps {
  document: EditorDocument;
  activeTool: ToolMode;
  selection: EditorSelection;
  ductDraft: DuctDraft | null;
  hoverPoint: Point3D | null;
  onHoverPointChange: (point: Point3D | null) => void;
  onCanvasPoint: (point: Point3D) => void;
  onSelectionChange: (selection: EditorSelection) => void;
}

export function Canvas2D({
  document,
  activeTool,
  selection,
  ductDraft,
  hoverPoint,
  onHoverPointChange,
  onCanvasPoint,
  onSelectionChange
}: Canvas2DProps) {
  function handlePointerMove(
    event: React.PointerEvent<SVGSVGElement>
  ): void {
    const nextPoint = getCanvasPointFromEvent(event);

    onHoverPointChange(nextPoint);
  }

  function handlePointerLeave(): void {
    onHoverPointChange(null);
  }

  function handleCanvasClick(
    event: React.PointerEvent<SVGSVGElement>
  ): void {
    onCanvasPoint(getCanvasPointFromEvent(event));
  }

  function handleAnchoredPointerDown(
    event: React.PointerEvent<SVGGElement | SVGCircleElement>,
    point: Point3D,
    nextSelection: EditorSelection
  ): void {
    event.stopPropagation();

    if (activeTool === "select") {
      onSelectionChange(nextSelection);

      return;
    }

    onCanvasPoint(point);
  }

  return (
    <section className="editor-stage" aria-label="2D editor">
      <div className="editor-stage-header">
        <div>
          <p className="section-kicker">Browser editor</p>
          <h2>Snap-based duct network canvas</h2>
        </div>
        <div className="editor-stage-status">
          <span>Tool: {describeTool(activeTool)}</span>
          <span>Grid: {Math.round(GRID_STEP_METERS * 100)} cm</span>
        </div>
      </div>

      <svg
        className="editor-canvas"
        role="img"
        aria-label="Duct network editor canvas"
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleCanvasClick}
      >
        <rect
          x="0"
          y="0"
          width={VIEW_BOX_WIDTH}
          height={VIEW_BOX_HEIGHT}
          className="canvas-surface"
        />

        <g className="canvas-grid">
          {Array.from({
            length: Math.floor(CANVAS_WIDTH_METERS / GRID_STEP_METERS) + 1
          }).map((_, index) => {
            const x = CANVAS_PADDING_PX + index * GRID_STEP_METERS * CANVAS_SCALE_PX_PER_METER;
            const isMajor = index % 10 === 0;

            return (
              <line
                key={`grid-x-${index}`}
                x1={x}
                y1={CANVAS_PADDING_PX}
                x2={x}
                y2={VIEW_BOX_HEIGHT - CANVAS_PADDING_PX}
                className={isMajor ? "grid-line is-major" : "grid-line"}
              />
            );
          })}
          {Array.from({
            length: Math.floor(CANVAS_HEIGHT_METERS / GRID_STEP_METERS) + 1
          }).map((_, index) => {
            const y = CANVAS_PADDING_PX + index * GRID_STEP_METERS * CANVAS_SCALE_PX_PER_METER;
            const isMajor = index % 10 === 0;

            return (
              <line
                key={`grid-y-${index}`}
                x1={CANVAS_PADDING_PX}
                y1={y}
                x2={VIEW_BOX_WIDTH - CANVAS_PADDING_PX}
                y2={y}
                className={isMajor ? "grid-line is-major" : "grid-line"}
              />
            );
          })}
        </g>

        <g className="canvas-ducts">
          {document.components
            .filter((component) => component.type === "ductSegment")
            .map((component) => {
              const startNode = findNode(document.nodes, component.nodeIds[0]);
              const endNode = findNode(document.nodes, component.nodeIds[1]);

              if (!startNode || !endNode) {
                return null;
              }

              const start = toCanvasPoint(startNode.position);
              const end = toCanvasPoint(endNode.position);
              const isSelected =
                selection?.kind === "component" && selection.id === component.id;

              return (
                <g key={component.id}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    className={isSelected ? "duct-line is-selected" : "duct-line"}
                    style={{
                      strokeWidth: Math.max(
                        12,
                        component.geometry.diameterMm / 16
                      )
                    }}
                  />
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    className="duct-hit-area"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectionChange({
                        kind: "component",
                        id: component.id
                      });
                    }}
                  />
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 12}
                    className="duct-label"
                  >
                    {component.metadata.label ?? component.id}
                  </text>
                </g>
              );
            })}
        </g>

        <g className="canvas-endpoints">
          {document.components
            .filter((component) => component.type === "ahu" || component.type === "terminal")
            .map((component) => {
              const node = findNode(document.nodes, component.nodeIds[0]);

              if (!node) {
                return null;
              }

              const point = toCanvasPoint(node.position);
              const isSelected =
                selection?.kind === "component" && selection.id === component.id;

              return (
                <g
                  key={component.id}
                  className={isSelected ? "endpoint-marker is-selected" : "endpoint-marker"}
                  onPointerDown={(event) => {
                    handleAnchoredPointerDown(event, node.position, {
                      kind: "component",
                      id: component.id
                    });
                  }}
                >
                  {component.type === "ahu" ? (
                    <rect
                      x={point.x - 30}
                      y={point.y - 24}
                      width="60"
                      height="48"
                      rx="14"
                    />
                  ) : (
                    <path
                      d={createTerminalPath(point.x, point.y, component.metadata.terminalType)}
                    />
                  )}
                  <text x={point.x} y={point.y + 40} className="endpoint-label">
                    {component.metadata.label}
                  </text>
                </g>
              );
            })}
        </g>

        <g className="canvas-nodes">
          {document.nodes.map((node) => {
            const point = toCanvasPoint(node.position);
            const isSelected =
              selection?.kind === "node" && selection.id === node.id;

            return (
              <g key={node.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isSelected ? 8 : 6}
                  className={isSelected ? "node-dot is-selected" : "node-dot"}
                  onPointerDown={(event) => {
                    handleAnchoredPointerDown(event, node.position, {
                      kind: "node",
                      id: node.id
                    });
                  }}
                />
                {isSelected ? (
                  <text x={point.x + 12} y={point.y - 12} className="node-label">
                    {node.metadata.label ?? node.id}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {ductDraft && hoverPoint ? (
          <line
            x1={toCanvasPoint(ductDraft.startPosition).x}
            y1={toCanvasPoint(ductDraft.startPosition).y}
            x2={toCanvasPoint(hoverPoint).x}
            y2={toCanvasPoint(hoverPoint).y}
            className="draft-line"
          />
        ) : null}

        {hoverPoint ? (
          <g className="hover-crosshair">
            <line
              x1={toCanvasPoint(hoverPoint).x}
              y1={CANVAS_PADDING_PX}
              x2={toCanvasPoint(hoverPoint).x}
              y2={VIEW_BOX_HEIGHT - CANVAS_PADDING_PX}
            />
            <line
              x1={CANVAS_PADDING_PX}
              y1={toCanvasPoint(hoverPoint).y}
              x2={VIEW_BOX_WIDTH - CANVAS_PADDING_PX}
              y2={toCanvasPoint(hoverPoint).y}
            />
          </g>
        ) : null}
      </svg>
    </section>
  );
}

function getCanvasPointFromEvent(
  event: React.PointerEvent<SVGSVGElement>
): Point3D {
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;
  const scaleX = VIEW_BOX_WIDTH / rect.width;
  const scaleY = VIEW_BOX_HEIGHT / rect.height;
  const svgX = relativeX * scaleX;
  const svgY = relativeY * scaleY;

  const xMeters = clamp(
    (svgX - CANVAS_PADDING_PX) / CANVAS_SCALE_PX_PER_METER,
    0,
    CANVAS_WIDTH_METERS
  );
  const yMeters = clamp(
    (svgY - CANVAS_PADDING_PX) / CANVAS_SCALE_PX_PER_METER,
    0,
    CANVAS_HEIGHT_METERS
  );

  return {
    x: Math.round(xMeters / GRID_STEP_METERS) * GRID_STEP_METERS,
    y: Math.round(yMeters / GRID_STEP_METERS) * GRID_STEP_METERS,
    z: 0
  };
}

function toCanvasPoint(point: Point3D): { x: number; y: number } {
  return {
    x: CANVAS_PADDING_PX + point.x * CANVAS_SCALE_PX_PER_METER,
    y: CANVAS_PADDING_PX + point.y * CANVAS_SCALE_PX_PER_METER
  };
}

function findNode(nodes: DuctNode[], nodeId: string): DuctNode | null {
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function describeTool(tool: ToolMode): string {
  switch (tool) {
    case "select":
      return "Select";
    case "duct":
      return "Draw duct";
    case "ahu":
      return "Place AHU";
    case "supplyTerminal":
      return "Place supply terminal";
    case "exhaustTerminal":
      return "Place exhaust terminal";
    case "outdoorTerminal":
      return "Place outdoor terminal";
    case "exhaustAirTerminal":
      return "Place exhaust air terminal";
  }
}

function createTerminalPath(
  centerX: number,
  centerY: number,
  terminalType: "supply" | "exhaust" | "outdoor" | "exhaustAir"
): string {
  switch (terminalType) {
    case "supply":
      return `M ${centerX} ${centerY - 24} L ${centerX + 22} ${centerY + 18} L ${centerX - 22} ${centerY + 18} Z`;
    case "exhaust":
      return `M ${centerX - 24} ${centerY - 20} L ${centerX + 24} ${centerY - 20} L ${centerX} ${centerY + 24} Z`;
    case "outdoor":
      return `M ${centerX} ${centerY - 26} L ${centerX + 20} ${centerY} L ${centerX} ${centerY + 26} L ${centerX - 20} ${centerY} Z`;
    case "exhaustAir":
      return `M ${centerX - 24} ${centerY} A 24 24 0 1 0 ${centerX + 24} ${centerY} A 24 24 0 1 0 ${centerX - 24} ${centerY}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
