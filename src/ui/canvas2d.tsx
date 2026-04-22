import { useRef, useState } from "react";
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
const CANVAS_WIDTH_METERS = 120;
const CANVAS_HEIGHT_METERS = 74;
const CANVAS_PADDING_PX = 44;
const DISPLAY_GRID_STEP_METERS = GRID_STEP_METERS;
const DISPLAY_GRID_MAJOR_STEP_METERS = 1;
const BASE_VIEWPORT_WIDTH_METERS = 12;
const BASE_VIEWPORT_HEIGHT_METERS = 7.4;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const PAN_THRESHOLD_PX = 4;
const TOTAL_CANVAS_WIDTH_PX =
  CANVAS_WIDTH_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2;
const TOTAL_CANVAS_HEIGHT_PX =
  CANVAS_HEIGHT_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2;

interface PanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startSvgPoint: {
    x: number;
    y: number;
  };
  startViewportOrigin: {
    x: number;
    y: number;
  };
  didPan: boolean;
}

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
  const [zoom, setZoom] = useState(1);
  const [viewportOrigin, setViewportOrigin] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panSessionRef = useRef<PanSession | null>(null);
  const viewBoxWidth =
    BASE_VIEWPORT_WIDTH_METERS * (1 / zoom) * CANVAS_SCALE_PX_PER_METER +
    CANVAS_PADDING_PX * 2;
  const viewBoxHeight =
    BASE_VIEWPORT_HEIGHT_METERS * (1 / zoom) * CANVAS_SCALE_PX_PER_METER +
    CANVAS_PADDING_PX * 2;

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const panSession = panSessionRef.current;

    if (
      panSession !== null &&
      panSession.pointerId === event.pointerId
    ) {
      const deltaClientX = event.clientX - panSession.startClientX;
      const deltaClientY = event.clientY - panSession.startClientY;

      if (
        !panSession.didPan &&
        (Math.abs(deltaClientX) >= PAN_THRESHOLD_PX ||
          Math.abs(deltaClientY) >= PAN_THRESHOLD_PX)
      ) {
        panSession.didPan = true;
        setIsPanning(true);
        onHoverPointChange(null);
      }

      if (panSession.didPan) {
        const currentSvgPoint = getSvgPointFromEvent(event);

        setViewportOrigin(
          clampViewportOrigin(
            {
              x:
                panSession.startViewportOrigin.x -
                (currentSvgPoint.x - panSession.startSvgPoint.x),
              y:
                panSession.startViewportOrigin.y -
                (currentSvgPoint.y - panSession.startSvgPoint.y)
            },
            viewBoxWidth,
            viewBoxHeight
          )
        );

        return;
      }
    }

    onHoverPointChange(getCanvasPointFromEvent(event));
  }

  function handlePointerLeave(): void {
    if (panSessionRef.current?.didPan) {
      return;
    }

    onHoverPointChange(null);
  }

  function handleCanvasPointerDown(
    event: React.PointerEvent<SVGSVGElement>
  ): void {
    if (event.button !== 0) {
      return;
    }

    panSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSvgPoint: getSvgPointFromEvent(event),
      startViewportOrigin: viewportOrigin,
      didPan: false
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerUp(
    event: React.PointerEvent<SVGSVGElement>
  ): void {
    const panSession = panSessionRef.current;

    if (
      event.button !== 0 ||
      panSession === null ||
      panSession.pointerId !== event.pointerId
    ) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    panSessionRef.current = null;

    if (panSession.didPan) {
      setIsPanning(false);
      onHoverPointChange(null);

      return;
    }

    onCanvasPoint(getCanvasPointFromEvent(event));
  }

  function handleCanvasPointerCancel(
    event: React.PointerEvent<SVGSVGElement>
  ): void {
    if (panSessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    panSessionRef.current = null;
    setIsPanning(false);
    onHoverPointChange(null);
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>): void {
    event.preventDefault();

    const nextZoom = clamp(
      Number((zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)).toFixed(4)),
      MIN_ZOOM,
      MAX_ZOOM
    );
    const nextViewBoxWidth =
      BASE_VIEWPORT_WIDTH_METERS * (1 / nextZoom) * CANVAS_SCALE_PX_PER_METER +
      CANVAS_PADDING_PX * 2;
    const nextViewBoxHeight =
      BASE_VIEWPORT_HEIGHT_METERS * (1 / nextZoom) * CANVAS_SCALE_PX_PER_METER +
      CANVAS_PADDING_PX * 2;

    setZoom(nextZoom);
    setViewportOrigin((currentOrigin) =>
      clampViewportOrigin(currentOrigin, nextViewBoxWidth, nextViewBoxHeight)
    );
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
          <span>Grid snap: {Math.round(GRID_STEP_METERS * 100)} cm</span>
          <span>Canvas: {CANVAS_WIDTH_METERS} x {CANVAS_HEIGHT_METERS} m</span>
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          <span>Wheel: zoom</span>
          <span>Drag background: pan</span>
        </div>
      </div>

      <svg
        className={isPanning ? "editor-canvas is-panning" : "editor-canvas"}
        role="img"
        aria-label="Duct network editor canvas"
        viewBox={`${viewportOrigin.x} ${viewportOrigin.y} ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMinYMin meet"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerCancel}
        onWheel={handleWheel}
      >
        <rect
          x="0"
          y="0"
          width={
            CANVAS_WIDTH_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2
          }
          height={
            CANVAS_HEIGHT_METERS * CANVAS_SCALE_PX_PER_METER + CANVAS_PADDING_PX * 2
          }
          className="canvas-surface"
        />

        <g className="canvas-grid">
          {Array.from({
            length: Math.floor(CANVAS_WIDTH_METERS / DISPLAY_GRID_STEP_METERS) + 1
          }).map((_, index) => {
            const x =
              CANVAS_PADDING_PX +
              index * DISPLAY_GRID_STEP_METERS * CANVAS_SCALE_PX_PER_METER;
            const meters = index * DISPLAY_GRID_STEP_METERS;
            const isMajor = meters % DISPLAY_GRID_MAJOR_STEP_METERS === 0;

            return (
              <line
                key={`grid-x-${index}`}
                x1={x}
                y1={CANVAS_PADDING_PX}
                x2={x}
                y2={
                  CANVAS_HEIGHT_METERS * CANVAS_SCALE_PX_PER_METER +
                  CANVAS_PADDING_PX
                }
                className={isMajor ? "grid-line is-major" : "grid-line"}
              />
            );
          })}
          {Array.from({
            length: Math.floor(CANVAS_HEIGHT_METERS / DISPLAY_GRID_STEP_METERS) + 1
          }).map((_, index) => {
            const y =
              CANVAS_PADDING_PX +
              index * DISPLAY_GRID_STEP_METERS * CANVAS_SCALE_PX_PER_METER;
            const meters = index * DISPLAY_GRID_STEP_METERS;
            const isMajor = meters % DISPLAY_GRID_MAJOR_STEP_METERS === 0;

            return (
              <line
                key={`grid-y-${index}`}
                x1={CANVAS_PADDING_PX}
                y1={y}
                x2={
                  CANVAS_WIDTH_METERS * CANVAS_SCALE_PX_PER_METER +
                  CANVAS_PADDING_PX
                }
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
                        4,
                        component.geometry.diameterMm / 70
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
                    y={(start.y + end.y) / 2 - 14}
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
                  {renderEndpointSymbol(component, point)}
                  <text x={point.x} y={point.y + 34} className="endpoint-label">
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
                  r={isSelected ? 7 : 5}
                  className={isSelected ? "node-dot is-selected" : "node-dot"}
                  onPointerDown={(event) => {
                    handleAnchoredPointerDown(event, node.position, {
                      kind: "node",
                      id: node.id
                    });
                  }}
                />
                {isSelected ? (
                  <text x={point.x + 16} y={point.y - 14} className="node-label">
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
              y2={
                CANVAS_HEIGHT_METERS * CANVAS_SCALE_PX_PER_METER +
                CANVAS_PADDING_PX
              }
            />
            <line
              x1={CANVAS_PADDING_PX}
              y1={toCanvasPoint(hoverPoint).y}
              x2={
                CANVAS_WIDTH_METERS * CANVAS_SCALE_PX_PER_METER +
                CANVAS_PADDING_PX
              }
              y2={toCanvasPoint(hoverPoint).y}
            />
          </g>
        ) : null}
      </svg>
    </section>
  );
}

function renderEndpointSymbol(
  component: Extract<NetworkComponent, { type: "ahu" | "terminal" }>,
  point: { x: number; y: number }
) {
  if (component.type === "ahu") {
    return (
      <>
        <rect
          className="endpoint-ahu-shell"
          x={point.x - 22}
          y={point.y - 18}
          width="44"
          height="36"
          rx="8"
        />
        <rect
          className="endpoint-ahu-port"
          x={point.x + 18}
          y={point.y - 6}
          width="12"
          height="12"
          rx="3"
        />
      </>
    );
  }

  switch (component.metadata.terminalType) {
    case "supply":
      return (
        <>
          <circle className="endpoint-terminal-ring" cx={point.x} cy={point.y} r="15" />
          <circle className="endpoint-terminal-core" cx={point.x} cy={point.y} r="7" />
          <line className="endpoint-terminal-detail" x1={point.x - 10} y1={point.y} x2={point.x + 10} y2={point.y} />
          <line className="endpoint-terminal-detail" x1={point.x} y1={point.y - 10} x2={point.x} y2={point.y + 10} />
        </>
      );
    case "exhaust":
      return (
        <>
          <rect
            className="endpoint-terminal-ring"
            x={point.x - 14}
            y={point.y - 14}
            width="28"
            height="28"
            rx="6"
          />
          <rect
            className="endpoint-terminal-core"
            x={point.x - 6}
            y={point.y - 6}
            width="12"
            height="12"
            rx="3"
          />
        </>
      );
    case "outdoor":
      return (
        <>
          <circle className="endpoint-air-ring" cx={point.x} cy={point.y} r="15" />
          <line className="endpoint-air-arrow" x1={point.x - 24} y1={point.y} x2={point.x + 6} y2={point.y} />
          <path className="endpoint-air-arrow" d={`M ${point.x + 6} ${point.y} L ${point.x - 2} ${point.y - 6} L ${point.x - 2} ${point.y + 6} Z`} />
        </>
      );
    case "exhaustAir":
      return (
        <>
          <circle className="endpoint-air-ring" cx={point.x} cy={point.y} r="15" />
          <line className="endpoint-air-arrow" x1={point.x - 6} y1={point.y} x2={point.x + 24} y2={point.y} />
          <path className="endpoint-air-arrow" d={`M ${point.x + 24} ${point.y} L ${point.x + 16} ${point.y - 6} L ${point.x + 16} ${point.y + 6} Z`} />
        </>
      );
  }
}

function getCanvasPointFromEvent(
  event: React.PointerEvent<SVGSVGElement>
): Point3D {
  const svgPoint = getSvgPointFromEvent(event);
  const svgX = svgPoint.x;
  const svgY = svgPoint.y;

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

function getSvgPointFromEvent(
  event: React.PointerEvent<SVGSVGElement>
): { x: number; y: number } {
  const svg = event.currentTarget;
  const screenPoint = new DOMPoint(event.clientX, event.clientY);
  const screenToSvgMatrix = svg.getScreenCTM()?.inverse();

  if (!screenToSvgMatrix) {
    return {
      x: 0,
      y: 0
    };
  }

  const svgPoint = screenPoint.matrixTransform(screenToSvgMatrix);

  return {
    x: svgPoint.x,
    y: svgPoint.y
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampViewportOrigin(
  origin: { x: number; y: number },
  viewBoxWidth: number,
  viewBoxHeight: number
): { x: number; y: number } {
  return {
    x: clamp(origin.x, 0, Math.max(0, TOTAL_CANVAS_WIDTH_PX - viewBoxWidth)),
    y: clamp(origin.y, 0, Math.max(0, TOTAL_CANVAS_HEIGHT_PX - viewBoxHeight))
  };
}
