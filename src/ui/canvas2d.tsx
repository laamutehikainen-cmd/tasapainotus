import { useEffect, useRef, useState } from "react";
import type { AutomaticFittingResult } from "../calc";
import {
  DEFAULT_AHU_PORT_OFFSET_METERS,
  getAhuPortAnchors,
  type AhuComponent,
  type NetworkComponent
} from "../components";
import {
  getAirSystemColor,
  type AirSystemType
} from "../airSystems";
import type { Point3D } from "../core/geometry";
import type { DuctNode } from "../core/nodes";
import { GRID_STEP_METERS } from "../core/snapping";
import type {
  DuctDraftAnchor,
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
  automaticFittings: AutomaticFittingResult[];
  ductAirSystems: Record<string, AirSystemType>;
  activeTool: ToolMode;
  selection: EditorSelection;
  ductDraft: DuctDraft | null;
  hoverPoint: Point3D | null;
  onHoverPointChange: (point: Point3D | null) => void;
  onCanvasPoint: (point: Point3D, anchor?: DuctDraftAnchor | null) => void;
  onSelectionChange: (selection: EditorSelection) => void;
}

type CanvasPointerEvent = React.PointerEvent<SVGElement>;

export function Canvas2D({
  document,
  automaticFittings,
  ductAirSystems,
  activeTool,
  selection,
  ductDraft,
  hoverPoint,
  onHoverPointChange,
  onCanvasPoint,
  onSelectionChange
}: Canvas2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportOrigin, setViewportOrigin] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panSessionRef = useRef<PanSession | null>(null);
  const fittingsByNode = groupAutomaticFittingsByNode(automaticFittings);
  const viewBoxWidth =
    BASE_VIEWPORT_WIDTH_METERS * (1 / zoom) * CANVAS_SCALE_PX_PER_METER +
    CANVAS_PADDING_PX * 2;
  const viewBoxHeight =
    BASE_VIEWPORT_HEIGHT_METERS * (1 / zoom) * CANVAS_SCALE_PX_PER_METER +
    CANVAS_PADDING_PX * 2;

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    function handleNativeWheel(event: WheelEvent): void {
      event.preventDefault();
      event.stopPropagation();

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

    svg.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      svg.removeEventListener("wheel", handleNativeWheel);
    };
  }, [zoom]);

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

  function handleAhuPortPointerDown(
    event: React.PointerEvent<SVGCircleElement | SVGTextElement>,
    component: AhuComponent,
    node: DuctNode,
    portPosition: Point3D,
    portType: NonNullable<
      Extract<NetworkComponent, { type: "ductSegment" }>["metadata"]["ahuConnection"]
    >["portType"]
  ): void {
    event.stopPropagation();

    if (activeTool === "select") {
      onSelectionChange({
        kind: "component",
        id: component.id
      });

      return;
    }

    onCanvasPoint(node.position, {
      renderPosition: portPosition,
      ahuConnection: {
        componentId: component.id,
        nodeId: node.id,
        portType
      }
    });
  }

  function handleDuctPointerDown(
    event: React.PointerEvent<SVGLineElement>,
    nextSelection: EditorSelection
  ): void {
    event.stopPropagation();

    if (activeTool === "select") {
      onSelectionChange(nextSelection);

      return;
    }

    onCanvasPoint(getCanvasPointFromEvent(event));
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
        ref={svgRef}
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

              const { start, end } = getRenderedDuctCanvasEndpoints(
                component,
                startNode,
                endNode,
                document
              );
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
                      stroke: isSelected
                        ? undefined
                        : getAirSystemColor(ductAirSystems[component.id]),
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
                    onPointerDown={(event) =>
                      handleDuctPointerDown(event, {
                        kind: "component",
                        id: component.id
                      })
                    }
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

        <g className="canvas-fitting-highlights" aria-hidden="true">
          {document.nodes.map((node) => {
            const nodeFittings = fittingsByNode.get(node.id);

            if (!nodeFittings || nodeFittings.length === 0) {
              return null;
            }

            const point = toCanvasPoint(node.position);
            const fittingSummaries = summarizeNodeFittings(nodeFittings);
            const hasOverride = nodeFittings.some(
              (fitting) => fitting.manualOverrideApplied
            );
            const isSelected =
              selection?.kind === "node" && selection.id === node.id;

            return (
              <g
                key={`fitting-highlight-${node.id}`}
                className={
                  isSelected
                    ? "canvas-fitting-highlight is-selected"
                    : "canvas-fitting-highlight"
                }
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hasOverride ? 17 : 15}
                  className={
                    hasOverride
                      ? "fitting-node-halo has-override"
                      : "fitting-node-halo"
                  }
                />
                {fittingSummaries.map((summary, index) => (
                  <g
                    key={`${node.id}-${summary.fittingType}`}
                    transform={`translate(${point.x - 12 + index * 26}, ${point.y - 29})`}
                    className="fitting-node-badge"
                  >
                    <rect
                      x="0"
                      y="0"
                      width="24"
                      height="16"
                      rx="8"
                      className={
                        summary.hasOverride
                          ? "fitting-badge-pill has-override"
                          : "fitting-badge-pill"
                      }
                    />
                    <text x="12" y="11" className="fitting-badge-label">
                      {describeFittingType(summary.fittingType)}
                      {summary.count > 1 ? summary.count : ""}
                    </text>
                  </g>
                ))}
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
                  {component.type === "ahu"
                    ? renderAhuSymbol(component, node.position, isSelected, activeTool, node, handleAhuPortPointerDown)
                    : renderTerminalSymbol(component, point)}
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
            x1={toCanvasPoint(ductDraft.startRenderPosition ?? ductDraft.startPosition).x}
            y1={toCanvasPoint(ductDraft.startRenderPosition ?? ductDraft.startPosition).y}
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

function renderAhuSymbol(
  component: AhuComponent,
  position: Point3D,
  isSelected: boolean,
  activeTool: ToolMode,
  node: DuctNode,
  onPortPointerDown: (
    event: React.PointerEvent<SVGCircleElement | SVGTextElement>,
    component: AhuComponent,
    node: DuctNode,
    portPosition: Point3D,
    portType: NonNullable<
      Extract<NetworkComponent, { type: "ductSegment" }>["metadata"]["ahuConnection"]
    >["portType"]
  ) => void
) {
  const center = toCanvasPoint(position);
  const widthPx = component.geometry.widthMeters * CANVAS_SCALE_PX_PER_METER;
  const depthPx = component.geometry.depthMeters * CANVAS_SCALE_PX_PER_METER;
  const ports = getAhuPortAnchors(
    component,
    position,
    DEFAULT_AHU_PORT_OFFSET_METERS
  );

  return (
    <>
      <rect
        className={isSelected ? "endpoint-ahu-shell is-selected" : "endpoint-ahu-shell"}
        x={center.x - widthPx / 2}
        y={center.y - depthPx / 2}
        width={widthPx}
        height={depthPx}
        rx="10"
        transform={`rotate(${component.metadata.rotationDegrees} ${center.x} ${center.y})`}
      />
      <line
        className="endpoint-ahu-axis"
        x1={center.x}
        y1={center.y}
        x2={center.x + Math.cos((component.metadata.rotationDegrees * Math.PI) / 180) * (widthPx / 2 - 16)}
        y2={center.y + Math.sin((component.metadata.rotationDegrees * Math.PI) / 180) * (widthPx / 2 - 16)}
      />
      {ports.map((port) => {
        const portPoint = toCanvasPoint(port.position);

        return (
          <g key={`${component.id}-${port.portType}`}>
            <circle
              cx={portPoint.x}
              cy={portPoint.y}
              r="8"
              className="endpoint-ahu-port-dot"
              style={{ fill: port.color, cursor: activeTool === "duct" ? "crosshair" : "pointer" }}
              onPointerDown={(event) =>
                onPortPointerDown(
                  event,
                  component,
                  node,
                  port.position,
                  port.portType
                )
              }
            />
            <text
              x={portPoint.x}
              y={portPoint.y - 12}
              className="endpoint-ahu-port-label"
              onPointerDown={(event) =>
                onPortPointerDown(
                  event,
                  component,
                  node,
                  port.position,
                  port.portType
                )
              }
            >
              {port.shortLabel}
            </text>
          </g>
        );
      })}
    </>
  );
}

function renderTerminalSymbol(
  component: Extract<NetworkComponent, { type: "terminal" }>,
  point: { x: number; y: number }
) {
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

function getCanvasPointFromEvent(event: CanvasPointerEvent): Point3D {
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

function getSvgPointFromEvent(event: CanvasPointerEvent): { x: number; y: number } {
  const svg =
    event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;

  if (!svg) {
    return {
      x: 0,
      y: 0
    };
  }

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
      return "Place extract air terminal";
    case "outdoorTerminal":
      return "Place outdoor terminal";
    case "exhaustAirTerminal":
      return "Place exhaust air terminal";
  }
}

function describeFittingType(
  fittingType: AutomaticFittingResult["fittingType"]
): string {
  switch (fittingType) {
    case "elbow":
      return "L";
    case "tee":
      return "T";
  }
}

function groupAutomaticFittingsByNode(
  automaticFittings: AutomaticFittingResult[]
): Map<string, AutomaticFittingResult[]> {
  const fittingsByNode = new Map<string, AutomaticFittingResult[]>();

  for (const fitting of automaticFittings) {
    const existingFittings = fittingsByNode.get(fitting.nodeId);

    if (existingFittings) {
      existingFittings.push(fitting);
    } else {
      fittingsByNode.set(fitting.nodeId, [fitting]);
    }
  }

  return fittingsByNode;
}

function summarizeNodeFittings(
  automaticFittings: AutomaticFittingResult[]
): Array<{
  fittingType: AutomaticFittingResult["fittingType"];
  count: number;
  hasOverride: boolean;
}> {
  const summaries = new Map<
    AutomaticFittingResult["fittingType"],
    {
      fittingType: AutomaticFittingResult["fittingType"];
      count: number;
      hasOverride: boolean;
    }
  >();

  for (const fitting of automaticFittings) {
    const existingSummary = summaries.get(fitting.fittingType);

    if (existingSummary) {
      existingSummary.count += 1;
      existingSummary.hasOverride =
        existingSummary.hasOverride || fitting.manualOverrideApplied;
    } else {
      summaries.set(fitting.fittingType, {
        fittingType: fitting.fittingType,
        count: 1,
        hasOverride: fitting.manualOverrideApplied
      });
    }
  }

  return [...summaries.values()];
}

function getRenderedDuctCanvasEndpoints(
  component: Extract<NetworkComponent, { type: "ductSegment" }>,
  startNode: DuctNode,
  endNode: DuctNode,
  document: EditorDocument
): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  let startPosition = startNode.position;
  let endPosition = endNode.position;
  const ahuConnection = component.metadata.ahuConnection;

  if (ahuConnection) {
    const ahu = document.components.find(
      (candidate): candidate is AhuComponent =>
        candidate.type === "ahu" && candidate.id === ahuConnection.componentId
    );
    const ahuNode = ahu ? findNode(document.nodes, ahuConnection.nodeId) : null;

    if (ahu && ahuNode) {
      const anchor = getAhuPortAnchors(
        ahu,
        ahuNode.position,
        DEFAULT_AHU_PORT_OFFSET_METERS
      ).find(
        (candidate) => candidate.portType === ahuConnection.portType
      );

      if (anchor) {
        if (startNode.id === ahuConnection.nodeId) {
          startPosition = anchor.position;
        }

        if (endNode.id === ahuConnection.nodeId) {
          endPosition = anchor.position;
        }
      }
    }
  }

  return {
    start: toCanvasPoint(startPosition),
    end: toCanvasPoint(endPosition)
  };
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
