import { analyzeDuctRoutes } from "../calc";
import {
  beginDuctDraft,
  buildGraphFromEditorDocument,
  completeDuctDraft,
  createInitialEditorDocument,
  deleteSelection,
  placeComponentAtPoint,
  updateComponentInDocument
} from "./editorState";

describe("editorState", () => {
  it("creates a drawable network that maps cleanly to the graph model", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 1, y: 2, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 5, y: 2, z: 0 }).document;

    const draft = beginDuctDraft(document, { x: 1, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 5, y: 2, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const routeAnalysis = analyzeDuctRoutes(graph);

    expect(graph.getNodes()).toHaveLength(2);
    expect(graph.getEdges()).toHaveLength(1);
    expect(routeAnalysis.routes).toHaveLength(1);
    expect(routeAnalysis.criticalPath?.terminalId).toBe("terminal-4");
  });

  it("deletes components and prunes isolated nodes", () => {
    let document = createInitialEditorDocument();

    const ahuResult = placeComponentAtPoint(document, "ahu", { x: 1, y: 1, z: 0 });
    document = ahuResult.document;

    document = deleteSelection(document, {
      kind: "component",
      id: "ahu-2"
    });

    expect(document.components).toHaveLength(0);
    expect(document.nodes).toHaveLength(0);
  });

  it("syncs outdoor and exhaust air terminal flows from editable terminal totals", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 5, y: 5, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 8, y: 5, z: 0 }).document;
    document = placeComponentAtPoint(document, "exhaustTerminal", { x: 8, y: 7, z: 0 }).document;
    document = placeComponentAtPoint(document, "outdoorTerminal", { x: 2, y: 5, z: 0 }).document;
    document = placeComponentAtPoint(document, "exhaustAirTerminal", { x: 2, y: 7, z: 0 }).document;

    document = updateComponentInDocument(document, "terminal-4", (component) =>
      component.type === "terminal"
        ? {
            ...component,
            flow: {
              designFlowRateLps: 260,
              actualFlowRateLps: 260
            }
          }
        : component
    );
    document = updateComponentInDocument(document, "terminal-6", (component) =>
      component.type === "terminal"
        ? {
            ...component,
            flow: {
              designFlowRateLps: 180,
              actualFlowRateLps: 180
            }
          }
        : component
    );

    const outdoorTerminal = document.components.find(
      (component) => component.id === "terminal-8"
    );
    const exhaustAirTerminal = document.components.find(
      (component) => component.id === "terminal-10"
    );

    expect(outdoorTerminal?.type).toBe("terminal");
    expect(exhaustAirTerminal?.type).toBe("terminal");
    expect(outdoorTerminal?.flow.designFlowRateLps).toBe(260);
    expect(exhaustAirTerminal?.flow.designFlowRateLps).toBe(180);
  });
});
