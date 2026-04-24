import { analyzeDuctRoutes } from "../calc";
import { DEFAULT_AHU_PORT_OFFSET_METERS, getAhuPortAnchors } from "../components";
import {
  beginDuctDraft,
  buildGraphFromEditorDocument,
  completeDuctDraft,
  createInitialEditorDocument,
  deleteSelection,
  placeComponentAtPoint,
  removeAutomaticFittingOverrideFromDocument,
  resetTerminalReferencePressureLossInDocument,
  updateActiveDuctDiameterInDocument,
  upsertAutomaticFittingOverrideInDocument,
  updateComponentInDocument,
  updateDefaultTerminalReferencePressureLossInDocument,
  updateTerminalReferencePressureLossInDocument
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

  it("uses the active duct diameter when completing the next duct draft", () => {
    let document = createInitialEditorDocument();

    document = updateActiveDuctDiameterInDocument(document, 315);
    document = placeComponentAtPoint(document, "ahu", { x: 1, y: 2, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 5, y: 2, z: 0 }).document;

    let draft = beginDuctDraft(document, { x: 1, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 5, y: 2, z: 0 }).document;

    document = updateActiveDuctDiameterInDocument(document, 160);
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 5, y: 4, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 5, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 5, y: 4, z: 0 }).document;

    const ducts = document.components.filter(
      (component) => component.type === "ductSegment"
    );

    expect(ducts).toHaveLength(2);
    expect(ducts[0]?.geometry.diameterMm).toBe(315);
    expect(ducts[1]?.geometry.diameterMm).toBe(160);
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

  it("syncs default terminal pressure losses while preserving overrides", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "supplyTerminal", { x: 1, y: 1, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 2, y: 1, z: 0 }).document;
    document = updateTerminalReferencePressureLossInDocument(
      document,
      "terminal-4",
      65
    );
    document = updateDefaultTerminalReferencePressureLossInDocument(
      document,
      "supply",
      42
    );

    const defaultTerminal = document.components.find(
      (component) => component.id === "terminal-2"
    );
    const overriddenTerminal = document.components.find(
      (component) => component.id === "terminal-4"
    );

    expect(defaultTerminal?.type).toBe("terminal");
    expect(overriddenTerminal?.type).toBe("terminal");

    if (
      defaultTerminal?.type !== "terminal" ||
      overriddenTerminal?.type !== "terminal"
    ) {
      throw new Error("Expected terminal components.");
    }

    expect(defaultTerminal.metadata.referencePressureLossPa).toBe(42);
    expect(defaultTerminal.metadata.referencePressureLossSource).toBe("default");
    expect(overriddenTerminal.metadata.referencePressureLossPa).toBe(65);
    expect(overriddenTerminal.metadata.referencePressureLossSource).toBe("override");

    document = resetTerminalReferencePressureLossInDocument(document, "terminal-4");

    const resetTerminal = document.components.find(
      (component) => component.id === "terminal-4"
    );

    expect(resetTerminal?.type).toBe("terminal");

    if (resetTerminal?.type !== "terminal") {
      throw new Error("Expected reset terminal.");
    }

    expect(resetTerminal.metadata.referencePressureLossPa).toBe(42);
    expect(resetTerminal.metadata.referencePressureLossSource).toBe("default");
  });

  it("creates a junction node and splits an existing duct when a new branch connects into it", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 0, y: 0, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 4, y: 0, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 2, y: 2, z: 0 }).document;

    let draft = beginDuctDraft(document, { x: 0, y: 0, z: 0 });
    document = completeDuctDraft(document, draft, { x: 4, y: 0, z: 0 }).document;

    draft = beginDuctDraft(document, { x: 2, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 2, y: 0, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const junctionNode = document.nodes.find(
      (node) => node.position.x === 2 && node.position.y === 0
    );
    const ductSegments = document.components.filter(
      (component) => component.type === "ductSegment"
    );

    expect(junctionNode).toBeDefined();
    expect(junctionNode?.kind).toBe("junction");
    expect(ductSegments).toHaveLength(3);
    expect(graph.getNodes()).toHaveLength(4);
    expect(graph.getEdges()).toHaveLength(3);
  });

  it("stores and removes automatic fitting overrides in the editor document", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 0, y: 0, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 4, y: 0, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 2, y: 2, z: 0 }).document;

    let draft = beginDuctDraft(document, { x: 0, y: 0, z: 0 });
    document = completeDuctDraft(document, draft, { x: 4, y: 0, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 2, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 2, y: 0, z: 0 }).document;

    const junctionNode = document.nodes.find(
      (node) => node.position.x === 2 && node.position.y === 0
    );
    const branchComponent = document.components.find(
      (component) =>
        component.type === "ductSegment" &&
        junctionNode !== undefined &&
        component.nodeIds.includes(junctionNode.id) &&
        component.geometry.lengthMeters === 2
    );

    expect(junctionNode).toBeDefined();
    expect(branchComponent?.type).toBe("ductSegment");

    document = upsertAutomaticFittingOverrideInDocument(document, {
      key: `${junctionNode!.id}::tee::${branchComponent!.id}`,
      nodeId: junctionNode!.id,
      fittingType: "tee",
      downstreamComponentId: branchComponent!.id,
      lossCoefficient: 0.9
    });

    expect(document.automaticFittingOverrides).toEqual([
      expect.objectContaining({
        key: `${junctionNode!.id}::tee::${branchComponent!.id}`,
        lossCoefficient: 0.9
      })
    ]);

    document = removeAutomaticFittingOverrideFromDocument(
      document,
      `${junctionNode!.id}::tee::${branchComponent!.id}`
    );

    expect(document.automaticFittingOverrides).toHaveLength(0);
  });

  it("stores the selected AHU port on a duct drawn from an AHU connection point", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 1, y: 2, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 5, y: 2, z: 0 }).document;

    const ahu = document.components.find((component) => component.type === "ahu");
    const ahuNode = document.nodes.find((node) => node.id === ahu?.nodeIds[0]);

    expect(ahu?.type).toBe("ahu");
    expect(ahuNode).toBeDefined();

    const supplyPort = getAhuPortAnchors(
      ahu!,
      ahuNode!.position,
      DEFAULT_AHU_PORT_OFFSET_METERS
    ).find(
      (port) => port.portType === "supply"
    );

    expect(supplyPort).toBeDefined();

    const draft = beginDuctDraft(
      document,
      ahuNode!.position,
      {
        renderPosition: supplyPort!.position,
        ahuConnection: {
          componentId: ahu!.id,
          nodeId: ahuNode!.id,
          portType: "supply"
        }
      }
    );
    document = completeDuctDraft(document, draft, { x: 5, y: 2, z: 0 }).document;

    const duct = document.components.find((component) => component.id === "duct-5");

    expect(duct?.type).toBe("ductSegment");

    if (!duct || duct.type !== "ductSegment") {
      throw new Error("Expected duct segment.");
    }

    expect(duct.metadata.ahuConnection).toEqual({
      componentId: "ahu-2",
      nodeId: "node-1",
      portType: "supply"
    });
  });
});
