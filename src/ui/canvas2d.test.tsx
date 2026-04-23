import { act, fireEvent, render } from "@testing-library/react";
import type { AutomaticFittingResult } from "../calc";
import {
  beginDuctDraft,
  completeDuctDraft,
  createInitialEditorDocument,
  placeComponentAtPoint,
  type EditorDocument
} from "./editorState";
import { Canvas2D } from "./canvas2d";

describe("Canvas2D", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "DOMPoint",
      class {
        constructor(
          public x: number,
          public y: number
        ) {}

        matrixTransform() {
          return {
            x: this.x,
            y: this.y
          };
        }
      }
    );

    Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => ({
        inverse: () => ({})
      })
    });
  });

  it("starts duct drawing from an existing endpoint instead of only selecting it", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onCanvasPoint = vi.fn();
    const onSelectionChange = vi.fn();
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="duct"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={onCanvasPoint}
        onSelectionChange={onSelectionChange}
      />
    );

    const endpoint = container.querySelector(".canvas-endpoints g");

    expect(endpoint).not.toBeNull();

    fireEvent.pointerDown(endpoint!);

    expect(onCanvasPoint).toHaveBeenCalledWith({ x: 1, y: 2, z: 0 });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("allows placement tools to target an existing junction node", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onCanvasPoint = vi.fn();
    const onSelectionChange = vi.fn();
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="supplyTerminal"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={onCanvasPoint}
        onSelectionChange={onSelectionChange}
      />
    );

    const nodes = [...container.querySelectorAll(".node-dot")];
    const junctionNode = nodes.at(-1);

    expect(junctionNode).not.toBeNull();

    fireEvent.pointerDown(junctionNode!);

    expect(onCanvasPoint).toHaveBeenCalledWith({ x: 3, y: 2, z: 0 });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("keeps anchored clicks selectable when the select tool is active", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onCanvasPoint = vi.fn();
    const onSelectionChange = vi.fn();
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="select"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={onCanvasPoint}
        onSelectionChange={onSelectionChange}
      />
    );

    const junctionNode = [...container.querySelectorAll(".node-dot")].at(-1);

    expect(junctionNode).not.toBeNull();

    fireEvent.pointerDown(junctionNode!);

    expect(onCanvasPoint).not.toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenCalledWith({
      kind: "node",
      id: "node-5"
    });
  });

  it("captures wheel zoom inside the canvas without leaking page scroll", () => {
    const document = createDocumentWithEndpointAndJunction();
    const { container, getByText } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="select"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={() => {}}
        onSelectionChange={() => {}}
      />
    );

    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(getByText("Zoom: 100%")).toBeInTheDocument();

    const wheelEvent = new WheelEvent("wheel", {
      deltaY: 120,
      bubbles: true,
      cancelable: true
    });
    let wasCancelled = false;

    act(() => {
      wasCancelled = !svg!.dispatchEvent(wheelEvent);
    });

    expect(wasCancelled).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(getByText("Zoom: 89%")).toBeInTheDocument();
  });

  it("allows the duct tool to snap into the middle of an existing duct", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onCanvasPoint = vi.fn();
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="duct"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={onCanvasPoint}
        onSelectionChange={() => {}}
      />
    );

    const ductHitArea = container.querySelector(".duct-hit-area");

    expect(ductHitArea).not.toBeNull();

    fireEvent.pointerDown(ductHitArea!, {
      clientX: 320,
      clientY: 228
    });

    expect(onCanvasPoint).toHaveBeenCalledWith({ x: 3, y: 2, z: 0 });
  });

  it("renders fitting highlights without taking node selection away", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onSelectionChange = vi.fn();
    const automaticFittings: AutomaticFittingResult[] = [
      {
        id: "auto-fitting:node-5:tee:duct-4",
        fittingType: "tee",
        nodeId: "node-5",
        nodeLabel: "Junction",
        nodeIndex: 1,
        downstreamComponentId: "duct-4",
        downstreamComponentLabel: "Branch duct",
        defaultLossCoefficient: 0.5,
        lossCoefficient: 0.5,
        flowRateLps: 35,
        velocityMps: 2.4,
        pressureLossPa: 1.8,
        isAutoGenerated: true,
        manualOverrideApplied: false
      }
    ];
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={automaticFittings}
        ductAirSystems={{}}
        activeTool="select"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={() => {}}
        onSelectionChange={onSelectionChange}
      />
    );

    const fittingHalo = container.querySelector(".fitting-node-halo");
    const junctionNode = [...container.querySelectorAll(".node-dot")].at(-1);

    expect(fittingHalo).not.toBeNull();
    expect(junctionNode).not.toBeNull();

    fireEvent.pointerDown(junctionNode!);

    expect(onSelectionChange).toHaveBeenCalledWith({
      kind: "node",
      id: "node-5"
    });
  });

  it("starts duct drawing from a color-coded AHU port anchor", () => {
    const document = createDocumentWithEndpointAndJunction();
    const onCanvasPoint = vi.fn();
    const { container } = render(
      <Canvas2D
        document={document}
        automaticFittings={[]}
        ductAirSystems={{}}
        activeTool="duct"
        selection={null}
        ductDraft={null}
        hoverPoint={null}
        onHoverPointChange={() => {}}
        onCanvasPoint={onCanvasPoint}
        onSelectionChange={() => {}}
      />
    );

    const portDot = container.querySelector(".endpoint-ahu-port-dot");

    expect(portDot).not.toBeNull();

    fireEvent.pointerDown(portDot!);

    expect(onCanvasPoint).toHaveBeenCalledWith(
      { x: 1, y: 2, z: 0 },
      expect.objectContaining({
        ahuConnection: expect.objectContaining({
          portType: "supply",
          componentId: "ahu-2"
        })
      })
    );
  });
});

function createDocumentWithEndpointAndJunction(): EditorDocument {
  let document = createInitialEditorDocument();

  document = placeComponentAtPoint(document, "ahu", { x: 1, y: 2, z: 0 }).document;
  document = placeComponentAtPoint(document, "supplyTerminal", { x: 5, y: 2, z: 0 }).document;

  let draft = beginDuctDraft(document, { x: 1, y: 2, z: 0 });
  document = completeDuctDraft(document, draft, { x: 3, y: 2, z: 0 }).document;
  draft = beginDuctDraft(document, { x: 3, y: 2, z: 0 });
  document = completeDuctDraft(document, draft, { x: 5, y: 2, z: 0 }).document;

  return document;
}
