import { act, fireEvent, render } from "@testing-library/react";
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
