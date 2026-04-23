import { analyzeDuctRoutes } from "../calc";
import { deriveDuctAirSystemLookup } from "../ductAirSystems";
import { DEFAULT_AHU_PORT_OFFSET_METERS, getAhuPortAnchors } from "../components";
import {
  beginDuctDraft,
  buildGraphFromEditorDocument,
  completeDuctDraft,
  createInitialEditorDocument,
  placeComponentAtPoint
} from "../ui/editorState";
import { buildView3DSceneData } from "./scene";

describe("buildView3DSceneData", () => {
  it("maps the editor document into 3D descriptors", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 1, y: 2, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 4, y: 2, z: 0 }).document;

    const ahu = document.components.find(
      (component) => component.type === "ahu"
    );
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
      { x: 1, y: 2, z: 0 },
      {
        renderPosition: supplyPort!.position,
        ahuConnection: {
          componentId: ahu!.id,
          nodeId: ahuNode!.id,
          portType: "supply"
        }
      }
    );
    document = completeDuctDraft(document, draft, { x: 4, y: 2, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const analysis = analyzeDuctRoutes(graph);
    const sceneData = buildView3DSceneData(
      document,
      analysis,
      deriveDuctAirSystemLookup(document, analysis)
    );
    const ahuEndpoint = sceneData.endpoints.find((item) => item.id === "ahu-2");

    expect(sceneData.ducts).toHaveLength(1);
    expect(sceneData.endpoints).toHaveLength(2);
    expect(ahuEndpoint).toEqual(
      expect.objectContaining({
        id: "ahu-2",
        geometry: expect.objectContaining({
          type: "ahu",
          ports: expect.arrayContaining([
            expect.objectContaining({
              airSystem: "supply",
              connectedDuctId: "duct-5"
            })
          ])
        })
      })
    );
    expect(sceneData.bounds?.minX).toBeLessThanOrEqual(1);
    expect(sceneData.bounds?.maxX).toBeGreaterThanOrEqual(4);
    expect(sceneData.bounds?.minZ).toBeLessThanOrEqual(2);
    expect(sceneData.bounds?.maxZ).toBeGreaterThanOrEqual(2);
    expect(sceneData.bounds?.maxY).toBeGreaterThan(3);
    expect(sceneData.ducts[0]?.isCritical).toBe(true);
    expect(sceneData.ducts[0]?.start.x).toBeGreaterThan(1);
    expect(sceneData.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "terminal-4",
          connectionDirection: { x: -1, y: 0, z: 0 },
          connectedDuctDiameterMeters: 0.25
        })
      ])
    );
  });

  it("keeps non-critical endpoints unhighlighted", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 1, y: 1, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 4, y: 1, z: 0 }).document;
    document = placeComponentAtPoint(document, "exhaustTerminal", { x: 4, y: 3, z: 0 }).document;

    let draft = beginDuctDraft(document, { x: 1, y: 1, z: 0 });
    document = completeDuctDraft(document, draft, { x: 4, y: 1, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 1, y: 1, z: 0 });
    document = completeDuctDraft(document, draft, { x: 4, y: 3, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const analysis = analyzeDuctRoutes(graph);
    const sceneData = buildView3DSceneData(
      document,
      analysis,
      deriveDuctAirSystemLookup(document, analysis)
    );
    const criticalTerminal = sceneData.endpoints.find(
      (item) => item.type === "terminal" && item.isCritical
    );
    const nonCriticalTerminal = sceneData.endpoints.find(
      (item) => item.type === "terminal" && !item.isCritical
    );

    expect(criticalTerminal?.id).toBe(analysis.criticalPath?.terminalId);
    expect(nonCriticalTerminal?.isCritical).toBe(false);
  });

  it("assigns AHU ports to supply, extract, outdoor air, and exhaust sides", () => {
    let document = createInitialEditorDocument();

    document = placeComponentAtPoint(document, "ahu", { x: 4, y: 4, z: 0 }).document;
    document = placeComponentAtPoint(document, "supplyTerminal", { x: 8, y: 4, z: 0 }).document;
    document = placeComponentAtPoint(document, "exhaustTerminal", { x: 4, y: 1, z: 0 }).document;
    document = placeComponentAtPoint(document, "outdoorTerminal", { x: 1, y: 4, z: 0 }).document;
    document = placeComponentAtPoint(document, "exhaustAirTerminal", { x: 4, y: 7, z: 0 }).document;

    const ahu = document.components.find((component) => component.type === "ahu");
    const ahuNode = document.nodes.find((node) => node.id === ahu?.nodeIds[0]);

    expect(ahu?.type).toBe("ahu");
    expect(ahuNode).toBeDefined();

    const ports = new Map(
      getAhuPortAnchors(
        ahu!,
        ahuNode!.position,
        DEFAULT_AHU_PORT_OFFSET_METERS
      ).map((port) => [port.portType, port])
    );

    let draft = beginDuctDraft(document, { x: 4, y: 4, z: 0 }, {
      renderPosition: ports.get("supply")!.position,
      ahuConnection: {
        componentId: ahu!.id,
        nodeId: ahuNode!.id,
        portType: "supply"
      }
    });
    document = completeDuctDraft(document, draft, { x: 8, y: 4, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 4, y: 4, z: 0 }, {
      renderPosition: ports.get("extract")!.position,
      ahuConnection: {
        componentId: ahu!.id,
        nodeId: ahuNode!.id,
        portType: "extract"
      }
    });
    document = completeDuctDraft(document, draft, { x: 4, y: 1, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 4, y: 4, z: 0 }, {
      renderPosition: ports.get("outdoor")!.position,
      ahuConnection: {
        componentId: ahu!.id,
        nodeId: ahuNode!.id,
        portType: "outdoor"
      }
    });
    document = completeDuctDraft(document, draft, { x: 1, y: 4, z: 0 }).document;
    draft = beginDuctDraft(document, { x: 4, y: 4, z: 0 }, {
      renderPosition: ports.get("exhaust")!.position,
      ahuConnection: {
        componentId: ahu!.id,
        nodeId: ahuNode!.id,
        portType: "exhaust"
      }
    });
    document = completeDuctDraft(document, draft, { x: 4, y: 7, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const analysis = analyzeDuctRoutes(graph);
    const sceneData = buildView3DSceneData(
      document,
      analysis,
      deriveDuctAirSystemLookup(document, analysis)
    );
    const ahuEndpoint = sceneData.endpoints.find(
      (item) => item.id === "ahu-2" && item.geometry.type === "ahu"
    );

    expect(ahuEndpoint).toBeDefined();

    if (!ahuEndpoint || ahuEndpoint.geometry.type !== "ahu") {
      throw new Error("Expected AHU descriptor.");
    }

    const portsBySystem = new Map(
      ahuEndpoint.geometry.ports.map((port) => [port.airSystem, port])
    );

    expect(portsBySystem.get("supply")?.direction).toEqual({ x: 1, y: 0, z: 0 });
    expect(portsBySystem.get("outdoor")?.direction).toEqual({ x: -1, y: 0, z: 0 });
    expect(portsBySystem.get("extract")?.direction).toEqual({ x: 0, y: -1, z: 0 });
    expect(portsBySystem.get("exhaust")?.direction).toEqual({ x: 0, y: 1, z: 0 });
    expect(
      sceneData.ducts.filter(
        (duct) => Math.abs(duct.start.x - 4) > 0.1 || Math.abs(duct.start.y - 4) > 0.1
      )
    ).toHaveLength(4);
  });
});
