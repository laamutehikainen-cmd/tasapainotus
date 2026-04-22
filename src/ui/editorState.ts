import {
  createAhu,
  createDuctSegment,
  createTerminalDevice,
  type NetworkComponent,
  type TerminalDeviceComponent
} from "../components";
import { clonePoint3D, type Point3D } from "../core/geometry";
import { DuctNetworkGraph } from "../core/graph";
import { createNode, type DuctNode } from "../core/nodes";
import { createPointKey, snapPointToGrid } from "../core/snapping";

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
}

export interface EditorDocument {
  nodes: DuctNode[];
  components: NetworkComponent[];
  nextSequence: number;
}

export interface EditorMutationResult {
  document: EditorDocument;
  selection: EditorSelection;
}

export function createInitialEditorDocument(): EditorDocument {
  return {
    nodes: [],
    components: [],
    nextSequence: 1
  };
}

export function beginDuctDraft(
  document: EditorDocument,
  position: Point3D
): DuctDraft {
  const snappedPosition = snapPointToGrid(position);
  const startNode = findNodeAtPosition(document, snappedPosition);

  return {
    startPosition: snappedPosition,
    startNodeId: startNode?.id ?? null
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
  endPosition: Point3D
): EditorMutationResult {
  const snappedEndPosition = snapPointToGrid(endPosition);

  if (
    createPointKey(draft.startPosition) === createPointKey(snappedEndPosition)
  ) {
    throw new Error("Duct start and end points must be different.");
  }

  let workingDocument = document;
  const startNodeResult = ensureNodeAtPosition(
    workingDocument,
    draft.startPosition,
    draft.startNodeId
  );
  workingDocument = startNodeResult.document;

  const endNodeResult = ensureNodeAtPosition(
    workingDocument,
    snappedEndPosition,
    null
  );
  workingDocument = endNodeResult.document;

  const duplicateSegment = workingDocument.components.find(
    (component) =>
      component.type === "ductSegment" &&
      component.nodeIds.includes(startNodeResult.nodeId) &&
      component.nodeIds.includes(endNodeResult.nodeId)
  );

  if (duplicateSegment) {
    throw new Error("A duct already exists between these nodes.");
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
        diameterMm: 250,
        lengthMeters: calculatePlanarDistanceMeters(
          draft.startPosition,
          snappedEndPosition
        ),
        label: `Duct ${workingDocument.nextSequence}`
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

function placeAhuAtPoint(
  document: EditorDocument,
  position: Point3D
): EditorMutationResult {
  if (document.components.some((component) => component.type === "ahu")) {
    throw new Error("Only one AHU can exist in the network.");
  }

  const snappedPosition = snapPointToGrid(position);
  const nodeResult = ensureNodeAtPosition(document, snappedPosition, null);
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
  const nodeResult = ensureNodeAtPosition(document, snappedPosition, null);
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

function ensureNodeAtPosition(
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
  const synchronizedDocument = synchronizeDerivedTerminalFlows(document);
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

  return {
    ...synchronizedDocument,
    nodes: synchronizedDocument.nodes
      .filter((node) => referencedNodeIds.has(node.id))
      .map((node) => ({
        ...node,
        kind: endpointNodeIds.has(node.id) ? "endpoint" : "junction"
      }))
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
      return `Exhaust terminal ${index}`;
    case "outdoor":
      return `Outdoor terminal ${index}`;
    case "exhaustAir":
      return `Exhaust air terminal ${index}`;
  }
}
