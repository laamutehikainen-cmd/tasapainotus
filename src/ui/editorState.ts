import {
  createAhu,
  createDuctSegment,
  getAhuPortAnchors,
  createTerminalDevice,
  type DuctAhuConnection,
  type DuctSegmentComponent,
  type NetworkComponent,
  type TerminalDeviceComponent,
  type TerminalDeviceType
} from "../components";
import type { AutomaticFittingOverride } from "../calc";
import type { AhuPortType } from "../airSystems";
import { clonePoint3D, type Point3D } from "../core/geometry";
import { DuctNetworkGraph } from "../core/graph";
import { createNode, type DuctNode } from "../core/nodes";
import { createPointKey, snapPointToGrid } from "../core/snapping";
import {
  normalizeRoundDuctDiameterMm,
  type StandardRoundDuctDiameterMm
} from "../data/ductSizes";
import { DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA } from "../data/defaultTerminalPressureLosses";

export type ToolMode =
  | "select"
  | "duct"
  | "ahu"
  | "supplyTerminal"
  | "exhaustTerminal"
  | "outdoorTerminal"
  | "exhaustAirTerminal";

export type EditorSelection =
  | {
      kind: "node";
      id: string;
    }
  | {
      kind: "component";
      id: string;
    }
  | null;

export interface DuctDraft {
  startPosition: Point3D;
  startNodeId: string | null;
  startRenderPosition: Point3D | null;
  ahuConnection: DuctAhuConnection | null;
}

export interface DuctDraftAnchor {
  renderPosition?: Point3D | null;
  ahuConnection?: DuctAhuConnection | null;
}

export interface EditorDocument {
  nodes: DuctNode[];
  components: NetworkComponent[];
  automaticFittingOverrides: AutomaticFittingOverride[];
  settings: EditorSettings;
  nextSequence: number;
}

export interface EditorSettings {
  activeDuctDiameterMm: StandardRoundDuctDiameterMm;
  defaultTerminalReferencePressureLossPa: Record<TerminalDeviceType, number>;
}

export interface EditorMutationResult {
  document: EditorDocument;
  selection: EditorSelection;
}

export function createInitialEditorDocument(): EditorDocument {
  return {
    nodes: [],
    components: [],
    automaticFittingOverrides: [],
    settings: createInitialEditorSettings(),
    nextSequence: 1
  };
}

export function createInitialEditorSettings(): EditorSettings {
  return {
    activeDuctDiameterMm: 160,
    defaultTerminalReferencePressureLossPa: {
      ...DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA
    }
  };
}

export function beginDuctDraft(
  document: EditorDocument,
  position: Point3D,
  anchor: DuctDraftAnchor | null = null
): DuctDraft {
  const snappedPosition = snapPointToGrid(position);
  const startNode = findNodeAtPosition(document, snappedPosition);

  return {
    startPosition: snappedPosition,
    startNodeId: anchor?.ahuConnection?.nodeId ?? startNode?.id ?? null,
    startRenderPosition: anchor?.renderPosition
      ? clonePoint3D(anchor.renderPosition)
      : null,
    ahuConnection: anchor?.ahuConnection ?? null
  };
}

export function placeComponentAtPoint(
  document: EditorDocument,
  toolMode: Exclude<ToolMode, "select" | "duct">,
  position: Point3D
): EditorMutationResult {
  switch (toolMode) {
    case "ahu":
      return placeAhuAtPoint(document, position);
    case "supplyTerminal":
      return placeTerminalAtPoint(document, position, "supply");
    case "exhaustTerminal":
      return placeTerminalAtPoint(document, position, "exhaust");
    case "outdoorTerminal":
      return placeTerminalAtPoint(document, position, "outdoor");
    case "exhaustAirTerminal":
      return placeTerminalAtPoint(document, position, "exhaustAir");
  }
}

export function completeDuctDraft(
  document: EditorDocument,
  draft: DuctDraft,
  endPosition: Point3D,
  anchor: DuctDraftAnchor | null = null
): EditorMutationResult {
  const snappedEndPosition = snapPointToGrid(endPosition);

  if (
    createPointKey(draft.startPosition) === createPointKey(snappedEndPosition)
  ) {
    throw new Error("Duct start and end points must be different.");
  }

  let workingDocument = document;
  const startNodeResult = ensureConnectionNodeAtPosition(
    workingDocument,
    draft.startPosition,
    draft.startNodeId
  );
  workingDocument = startNodeResult.document;

  const endNodeResult = ensureConnectionNodeAtPosition(
    workingDocument,
    snappedEndPosition,
    anchor?.ahuConnection?.nodeId ?? null
  );
  workingDocument = endNodeResult.document;

  const ahuConnection = draft.ahuConnection ?? anchor?.ahuConnection ?? null;

  const duplicateSegment = workingDocument.components.find(
    (component) =>
      component.type === "ductSegment" &&
      component.nodeIds.includes(startNodeResult.nodeId) &&
      component.nodeIds.includes(endNodeResult.nodeId)
  );

  if (duplicateSegment) {
    throw new Error("A duct already exists between these nodes.");
  }

  if (ahuConnection && isAhuPortAlreadyConnected(workingDocument, ahuConnection)) {
    throw new Error(`AHU ${ahuConnection.portType} port is already connected.`);
  }

  const ductId = createId(workingDocument, "duct");
  const nextDocument: EditorDocument = {
    ...workingDocument,
    nextSequence: workingDocument.nextSequence + 1,
    components: [
      ...workingDocument.components,
      createDuctSegment({
        id: ductId,
        startNodeId: startNodeResult.nodeId,
        endNodeId: endNodeResult.nodeId,
        diameterMm: workingDocument.settings.activeDuctDiameterMm,
        lengthMeters: calculatePlanarDistanceMeters(
          draft.startRenderPosition ?? draft.startPosition,
          anchor?.renderPosition ?? snappedEndPosition
        ),
        label: `Duct ${workingDocument.nextSequence}`,
        ahuConnection
      })
    ]
  };

  return {
    document: finalizeDocument(nextDocument),
    selection: {
      kind: "component",
      id: ductId
    }
  };
}

export function deleteSelection(
  document: EditorDocument,
  selection: EditorSelection
): EditorDocument {
  if (!selection) {
    return document;
  }

  if (selection.kind === "component") {
    return finalizeDocument({
      ...document,
      components: document.components.filter(
        (component) => component.id !== selection.id
      )
    });
  }

  const componentsToRemove = new Set(
    document.components
      .filter((component) => component.nodeIds.includes(selection.id))
      .map((component) => component.id)
  );

  return finalizeDocument({
    ...document,
    nodes: document.nodes.filter((node) => node.id !== selection.id),
    components: document.components.filter(
      (component) => !componentsToRemove.has(component.id)
    )
  });
}

export function buildGraphFromEditorDocument(
  document: EditorDocument
): DuctNetworkGraph {
  const graph = new DuctNetworkGraph();

  for (const node of document.nodes) {
    graph.addNode(node);
  }

  for (const component of document.components) {
    graph.addComponent(component);
  }

  return graph;
}

export function findNodeById(
  document: EditorDocument,
  nodeId: string
): DuctNode | null {
  return document.nodes.find((node) => node.id === nodeId) ?? null;
}

export function findComponentById(
  document: EditorDocument,
  componentId: string
): NetworkComponent | null {
  return (
    document.components.find((component) => component.id === componentId) ??
    null
  );
}

export function updateNodeInDocument(
  document: EditorDocument,
  nodeId: string,
  updater: (node: DuctNode) => DuctNode
): EditorDocument {
  return finalizeDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId ? updater(node) : node
    )
  });
}

export function updateComponentInDocument(
  document: EditorDocument,
  componentId: string,
  updater: (component: NetworkComponent) => NetworkComponent
): EditorDocument {
  return finalizeDocument({
    ...document,
    components: document.components.map((component) =>
      component.id === componentId ? updater(component) : component
    )
  });
}

export function upsertAutomaticFittingOverrideInDocument(
  document: EditorDocument,
  override: AutomaticFittingOverride
): EditorDocument {
  const existingOverrideIndex = document.automaticFittingOverrides.findIndex(
    (candidate) => candidate.key === override.key
  );
  const automaticFittingOverrides =
    existingOverrideIndex >= 0
      ? document.automaticFittingOverrides.map((candidate, index) =>
          index === existingOverrideIndex ? override : candidate
        )
      : [...document.automaticFittingOverrides, override];

  return finalizeDocument({
    ...document,
    automaticFittingOverrides
  });
}

export function removeAutomaticFittingOverrideFromDocument(
  document: EditorDocument,
  overrideKey: string
): EditorDocument {
  return finalizeDocument({
    ...document,
    automaticFittingOverrides: document.automaticFittingOverrides.filter(
      (override) => override.key !== overrideKey
    )
  });
}

export function updateActiveDuctDiameterInDocument(
  document: EditorDocument,
  value: number
): EditorDocument {
  return finalizeDocument({
    ...document,
    settings: {
      ...document.settings,
      activeDuctDiameterMm: normalizeRoundDuctDiameterMm(value)
    }
  });
}

export function updateDefaultTerminalReferencePressureLossInDocument(
  document: EditorDocument,
  terminalType: TerminalDeviceType,
  value: number
): EditorDocument {
  if (!Number.isFinite(value) || value <= 0) {
    return document;
  }

  return finalizeDocument({
    ...document,
    settings: {
      ...document.settings,
      defaultTerminalReferencePressureLossPa: {
        ...document.settings.defaultTerminalReferencePressureLossPa,
        [terminalType]: value
      }
    },
    components: document.components.map((component) =>
      component.type === "terminal" &&
      component.metadata.terminalType === terminalType &&
      component.metadata.referencePressureLossSource === "default"
        ? {
            ...component,
            metadata: {
              ...component.metadata,
              referencePressureLossPa: value
            }
          }
        : component
    )
  });
}

export function updateTerminalReferencePressureLossInDocument(
  document: EditorDocument,
  terminalId: string,
  value: number
): EditorDocument {
  if (!Number.isFinite(value) || value <= 0) {
    return document;
  }

  return updateComponentInDocument(document, terminalId, (component) =>
    component.type === "terminal"
      ? {
          ...component,
          metadata: {
            ...component.metadata,
            referencePressureLossPa: value,
            referencePressureLossSource: "override"
          }
        }
      : component
  );
}

export function resetTerminalReferencePressureLossInDocument(
  document: EditorDocument,
  terminalId: string
): EditorDocument {
  return updateComponentInDocument(document, terminalId, (component) =>
    component.type === "terminal"
      ? {
          ...component,
          metadata: {
            ...component.metadata,
            referencePressureLossPa:
              document.settings.defaultTerminalReferencePressureLossPa[
                component.metadata.terminalType
              ],
            referencePressureLossSource: "default"
          }
        }
      : component
  );
}

function placeAhuAtPoint(
  document: EditorDocument,
  position: Point3D
): EditorMutationResult {
  if (document.components.some((component) => component.type === "ahu")) {
    throw new Error("Only one AHU can exist in the network.");
  }

  const snappedPosition = snapPointToGrid(position);
  const nodeResult = ensureConnectionNodeAtPosition(document, snappedPosition, null);
  ensureNoEndpointComponentAtNode(nodeResult.document, nodeResult.nodeId);

  const componentId = createId(nodeResult.document, "ahu");
  const nextDocument: EditorDocument = {
    ...nodeResult.document,
    nextSequence: nodeResult.document.nextSequence + 1,
    components: [
      ...nodeResult.document.components,
      createAhu({
        id: componentId,
        nodeId: nodeResult.nodeId,
        label: "Main AHU"
      })
    ]
  };

  return {
    document: finalizeDocument(nextDocument),
    selection: {
      kind: "component",
      id: componentId
    }
  };
}

function placeTerminalAtPoint(
  document: EditorDocument,
  position: Point3D,
  terminalType: "supply" | "exhaust" | "outdoor" | "exhaustAir"
): EditorMutationResult {
  const snappedPosition = snapPointToGrid(position);
  const nodeResult = ensureConnectionNodeAtPosition(document, snappedPosition, null);
  ensureNoEndpointComponentAtNode(nodeResult.document, nodeResult.nodeId);

  const componentId = createId(nodeResult.document, "terminal");
  const nextDocument: EditorDocument = {
    ...nodeResult.document,
    nextSequence: nodeResult.document.nextSequence + 1,
    components: [
      ...nodeResult.document.components,
      createTerminalDevice({
        id: componentId,
        nodeId: nodeResult.nodeId,
        terminalType,
        designFlowRateLps: 200,
        referencePressureLossPa:
          nodeResult.document.settings.defaultTerminalReferencePressureLossPa[
            terminalType
          ],
        referencePressureLossSource: "default",
        label: createTerminalLabel(terminalType, nodeResult.document.nextSequence)
      })
    ]
  };

  return {
    document: finalizeDocument(nextDocument),
    selection: {
      kind: "component",
      id: componentId
    }
  };
}

function ensureConnectionNodeAtPosition(
  document: EditorDocument,
  position: Point3D,
  preferredNodeId: string | null
): {
  document: EditorDocument;
  nodeId: string;
} {
  if (preferredNodeId) {
    return {
      document,
      nodeId: preferredNodeId
    };
  }

  const existingNode = findNodeAtPosition(document, position);

  if (existingNode) {
    return {
      document,
      nodeId: existingNode.id
    };
  }

  const overlappingDuctSegments = findDuctSegmentsAtPosition(document, position);

  if (overlappingDuctSegments.length > 0) {
    return insertConnectionNodeIntoSegments(
      document,
      position,
      overlappingDuctSegments
    );
  }

  const nodeId = createId(document, "node");

  return {
    document: {
      ...document,
      nextSequence: document.nextSequence + 1,
      nodes: [
        ...document.nodes,
        createNode({
          id: nodeId,
          position: clonePoint3D(position),
          metadata: {
            label: `Node ${document.nextSequence}`
          }
        })
      ]
    },
    nodeId
  };
}

function insertConnectionNodeIntoSegments(
  document: EditorDocument,
  position: Point3D,
  segments: DuctSegmentComponent[]
): {
  document: EditorDocument;
  nodeId: string;
} {
  const nodeId = createId(document, "node");
  let workingDocument: EditorDocument = {
    ...document,
    nextSequence: document.nextSequence + 1,
    nodes: [
      ...document.nodes,
      createNode({
        id: nodeId,
        position: clonePoint3D(position),
        metadata: {
          label: `Node ${document.nextSequence}`
        }
      })
    ]
  };

  for (const segment of segments) {
    workingDocument = splitDuctSegmentAtNode(
      workingDocument,
      segment,
      nodeId,
      position
    );
  }

  return {
    document: workingDocument,
    nodeId
  };
}

function findNodeAtPosition(
  document: EditorDocument,
  position: Point3D
): DuctNode | null {
  const targetKey = createPointKey(position);

  return (
    document.nodes.find(
      (node) => createPointKey(snapPointToGrid(node.position)) === targetKey
    ) ?? null
  );
}

function findDuctSegmentsAtPosition(
  document: EditorDocument,
  position: Point3D
): DuctSegmentComponent[] {
  return document.components.filter(
    (component): component is DuctSegmentComponent =>
      component.type === "ductSegment" &&
      isPointOnDuctSegmentInterior(document, component, position)
  );
}

function isPointOnDuctSegmentInterior(
  document: EditorDocument,
  segment: DuctSegmentComponent,
  position: Point3D
): boolean {
  const startNode = findNodeById(document, segment.nodeIds[0]);
  const endNode = findNodeById(document, segment.nodeIds[1]);

  if (!startNode || !endNode) {
    return false;
  }

  if (
    createPointKey(startNode.position) === createPointKey(position) ||
    createPointKey(endNode.position) === createPointKey(position)
  ) {
    return false;
  }

  const segmentDx = endNode.position.x - startNode.position.x;
  const segmentDy = endNode.position.y - startNode.position.y;
  const pointDx = position.x - startNode.position.x;
  const pointDy = position.y - startNode.position.y;
  const crossProduct = segmentDx * pointDy - segmentDy * pointDx;
  const tolerance = 1e-6;

  if (Math.abs(crossProduct) > tolerance) {
    return false;
  }

  const dotProduct = pointDx * segmentDx + pointDy * segmentDy;
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;

  return (
    dotProduct > tolerance && dotProduct < segmentLengthSquared - tolerance
  );
}

function splitDuctSegmentAtNode(
  document: EditorDocument,
  segment: DuctSegmentComponent,
  nodeId: string,
  nodePosition: Point3D
): EditorDocument {
  const startNode = findNodeById(document, segment.nodeIds[0]);
  const endNode = findNodeById(document, segment.nodeIds[1]);

  if (!startNode || !endNode) {
    return document;
  }

  const firstSegmentId = createId(document, "duct");
  const secondSegmentId = `duct-${document.nextSequence + 1}`;
  const derivedSegments: DuctSegmentComponent[] = [
    createDerivedDuctSegment(
      segment,
      firstSegmentId,
      startNode.id,
      nodeId,
      startNode.position,
      nodePosition,
      "A",
      document.nextSequence,
      document
    ),
    createDerivedDuctSegment(
      segment,
      secondSegmentId,
      nodeId,
      endNode.id,
      nodePosition,
      endNode.position,
      "B",
      document.nextSequence + 1,
      document
    )
  ];

  return {
    ...document,
    nextSequence: document.nextSequence + 2,
    components: [
      ...document.components.filter((component) => component.id !== segment.id),
      ...derivedSegments
    ]
  };
}

function createDerivedDuctSegment(
  sourceSegment: DuctSegmentComponent,
  id: string,
  startNodeId: string,
  endNodeId: string,
  startPosition: Point3D,
  endPosition: Point3D,
  splitSuffix: "A" | "B",
  fallbackSequence: number,
  document: EditorDocument
): DuctSegmentComponent {
  const ahuConnection =
    sourceSegment.metadata.ahuConnection &&
    (startNodeId === sourceSegment.metadata.ahuConnection.nodeId ||
      endNodeId === sourceSegment.metadata.ahuConnection.nodeId)
      ? sourceSegment.metadata.ahuConnection
      : null;
  const ahuRenderPosition = ahuConnection
    ? resolveAhuConnectionRenderPosition(document, ahuConnection)
    : null;
  const renderedStartPosition =
    ahuConnection && startNodeId === ahuConnection.nodeId
      ? ahuRenderPosition ?? startPosition
      : startPosition;
  const renderedEndPosition =
    ahuConnection && endNodeId === ahuConnection.nodeId
      ? ahuRenderPosition ?? endPosition
      : endPosition;

  return createDuctSegment({
    id,
    startNodeId,
    endNodeId,
    diameterMm: sourceSegment.geometry.diameterMm,
    lengthMeters: calculatePlanarDistanceMeters(
      renderedStartPosition,
      renderedEndPosition
    ),
    designFlowRateLps: sourceSegment.flow.designFlowRateLps ?? undefined,
    material: sourceSegment.metadata.material,
    roughnessMm: sourceSegment.metadata.roughnessMm,
    localLossCoefficient: sourceSegment.metadata.localLossCoefficient,
    ahuConnection,
    label: sourceSegment.metadata.label
      ? `${sourceSegment.metadata.label} ${splitSuffix}`
      : `Duct ${fallbackSequence}`
  });
}

function ensureNoEndpointComponentAtNode(
  document: EditorDocument,
  nodeId: string
): void {
  const endpointComponent = document.components.find(
    (component) =>
      component.nodeIds.includes(nodeId) &&
      (component.type === "ahu" || component.type === "terminal")
  );

  if (endpointComponent) {
    throw new Error(
      `Node "${nodeId}" already contains endpoint component "${endpointComponent.id}".`
    );
  }
}

function finalizeDocument(document: EditorDocument): EditorDocument {
  const synchronizedDocument = synchronizeDefaultTerminalReferenceLosses(
    synchronizeDerivedTerminalFlows(document)
  );
  const referencedNodeIds = new Set(
    synchronizedDocument.components.flatMap((component) => [...component.nodeIds])
  );
  const endpointNodeIds = new Set(
    synchronizedDocument.components
      .filter(
        (component) => component.type === "ahu" || component.type === "terminal"
      )
      .flatMap((component) => [...component.nodeIds])
  );
  const synchronizedOverrides = synchronizedDocument.automaticFittingOverrides.filter(
    (override) =>
      referencedNodeIds.has(override.nodeId) &&
      synchronizedDocument.components.some(
        (component) => component.id === override.downstreamComponentId
      )
  );

  return {
    ...synchronizedDocument,
    automaticFittingOverrides: synchronizedOverrides,
    nodes: synchronizedDocument.nodes
      .filter((node) => referencedNodeIds.has(node.id))
      .map((node) => ({
        ...node,
        kind: endpointNodeIds.has(node.id) ? "endpoint" : "junction"
      }))
  };
}

function synchronizeDefaultTerminalReferenceLosses(
  document: EditorDocument
): EditorDocument {
  return {
    ...document,
    components: document.components.map((component) =>
      component.type === "terminal" &&
      component.metadata.referencePressureLossSource === "default"
        ? {
            ...component,
            metadata: {
              ...component.metadata,
              referencePressureLossPa:
                document.settings.defaultTerminalReferencePressureLossPa[
                  component.metadata.terminalType
                ]
            }
          }
        : component
    )
  };
}

function synchronizeDerivedTerminalFlows(
  document: EditorDocument
): EditorDocument {
  const supplyTerminalFlowRateLps = document.components.reduce(
    (sum, component) =>
      component.type === "terminal" &&
      component.metadata.terminalType === "supply"
        ? sum + (component.flow.designFlowRateLps ?? 0)
        : sum,
    0
  );
  const exhaustTerminalFlowRateLps = document.components.reduce(
    (sum, component) =>
      component.type === "terminal" &&
      component.metadata.terminalType === "exhaust"
        ? sum + (component.flow.designFlowRateLps ?? 0)
        : sum,
    0
  );
  const outdoorTerminalCount = document.components.filter(
    (component) =>
      component.type === "terminal" &&
      component.metadata.terminalType === "outdoor"
  ).length;
  const exhaustAirTerminalCount = document.components.filter(
    (component) =>
      component.type === "terminal" &&
      component.metadata.terminalType === "exhaustAir"
  ).length;
  const outdoorFlowRateLps =
    outdoorTerminalCount > 0
      ? supplyTerminalFlowRateLps / outdoorTerminalCount
      : 0;
  const exhaustAirFlowRateLps =
    exhaustAirTerminalCount > 0
      ? exhaustTerminalFlowRateLps / exhaustAirTerminalCount
      : 0;

  return {
    ...document,
    components: document.components.map((component) =>
      synchronizeTerminalFlow(
        component,
        outdoorFlowRateLps,
        exhaustAirFlowRateLps
      )
    )
  };
}

function synchronizeTerminalFlow(
  component: NetworkComponent,
  outdoorFlowRateLps: number,
  exhaustAirFlowRateLps: number
): NetworkComponent {
  if (component.type !== "terminal") {
    return component;
  }

  switch (component.metadata.terminalType) {
    case "outdoor":
      return updateTerminalFlow(component, outdoorFlowRateLps);
    case "exhaustAir":
      return updateTerminalFlow(component, exhaustAirFlowRateLps);
    default:
      return component;
  }
}

function updateTerminalFlow(
  component: TerminalDeviceComponent,
  flowRateLps: number
): TerminalDeviceComponent {
  return {
    ...component,
    flow: {
      designFlowRateLps: flowRateLps,
      actualFlowRateLps: flowRateLps
    }
  };
}

function createId(document: EditorDocument, prefix: string): string {
  return `${prefix}-${document.nextSequence}`;
}

function isAhuPortAlreadyConnected(
  document: EditorDocument,
  ahuConnection: DuctAhuConnection
): boolean {
  return document.components.some(
    (component) =>
      component.type === "ductSegment" &&
      component.metadata.ahuConnection?.componentId === ahuConnection.componentId &&
      component.metadata.ahuConnection.portType === ahuConnection.portType
  );
}

function resolveAhuConnectionRenderPosition(
  document: EditorDocument,
  ahuConnection: DuctAhuConnection
): Point3D {
  const ahu = document.components.find(
    (component): component is Extract<NetworkComponent, { type: "ahu" }> =>
      component.type === "ahu" && component.id === ahuConnection.componentId
  );
  const node = findNodeById(document, ahuConnection.nodeId);

  if (!ahu || !node) {
    return node?.position ?? { x: 0, y: 0, z: 0 };
  }

  const anchor = getAhuPortAnchors(ahu, node.position, 0).find(
    (candidate) => candidate.portType === ahuConnection.portType
  );

  return anchor?.position ?? node.position;
}

function calculatePlanarDistanceMeters(
  startPoint: Point3D,
  endPoint: Point3D
): number {
  return Number(
    Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y).toFixed(3)
  );
}

function createTerminalLabel(
  terminalType: "supply" | "exhaust" | "outdoor" | "exhaustAir",
  index: number
): string {
  switch (terminalType) {
    case "supply":
      return `Supply terminal ${index}`;
    case "exhaust":
      return `Extract air terminal ${index}`;
    case "outdoor":
      return `Outdoor terminal ${index}`;
    case "exhaustAir":
      return `Exhaust air terminal ${index}`;
  }
}
