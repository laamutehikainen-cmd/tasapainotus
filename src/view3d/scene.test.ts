import { analyzeDuctRoutes } from "../calc";
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

    const draft = beginDuctDraft(document, { x: 1, y: 2, z: 0 });
    document = completeDuctDraft(document, draft, { x: 4, y: 2, z: 0 }).document;

    const graph = buildGraphFromEditorDocument(document);
    const analysis = analyzeDuctRoutes(graph);
    const sceneData = buildView3DSceneData(document, analysis.criticalPath);

    expect(sceneData.ducts).toHaveLength(1);
    expect(sceneData.endpoints).toHaveLength(2);
    expect(sceneData.bounds).toEqual({
      minX: 1,
      maxX: 4,
      minZ: 2,
      maxZ: 2,
      maxY: 3
    });
    expect(sceneData.ducts[0]?.isCritical).toBe(true);
    expect(sceneData.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ahu-2",
          connectionDirection: { x: 1, y: 0, z: 0 },
          connectedDuctDiameterMeters: 0.25
        }),
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
    const sceneData = buildView3DSceneData(document, analysis.criticalPath);
    const criticalTerminal = sceneData.endpoints.find(
      (item) => item.type === "terminal" && item.isCritical
    );
    const nonCriticalTerminal = sceneData.endpoints.find(
      (item) => item.type === "terminal" && !item.isCritical
    );

    expect(criticalTerminal?.id).toBe(analysis.criticalPath?.terminalId);
    expect(nonCriticalTerminal?.isCritical).toBe(false);
  });
});
