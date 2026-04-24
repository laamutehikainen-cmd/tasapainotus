import * as THREE from "three";
import type { RouteAnalysisResult } from "../calc";
import { getAirSystemColor, type AirSystemType } from "../airSystems";
import type {
  AhuComponent,
  DuctAhuConnection,
  TerminalDeviceComponent,
  TerminalDeviceType
} from "../components";
import {
  DEFAULT_AHU_PORT_OFFSET_METERS,
  getAhuPortAnchors
} from "../components";
import type { Point3D } from "../core/geometry";
import type { DuctNode } from "../core/nodes";
import type { EditorDocument } from "../ui/editorState";

const NETWORK_ROOT_NAME = "network-root";
const ENVIRONMENT_ROOT_NAME = "environment-root";
const DUCT_CENTERLINE_HEIGHT_METERS = 1.8;
const AHU_COLLAR_LENGTH_METERS = 0.34;
const TERMINAL_NECK_LENGTH_METERS = 0.22;
const TERMINAL_PLATE_THICKNESS_METERS = 0.03;
const TERMINAL_PLATE_GAP_METERS = 0.045;

export type View3DAirSystem = AirSystemType;

export interface View3DBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

export interface View3DDuctDescriptor {
  id: string;
  start: Point3D;
  end: Point3D;
  diameterMeters: number;
  isCritical: boolean;
  airSystem: AirSystemType | null;
}

export interface View3DAhuPortDescriptor {
  id: string;
  connectedDuctId: string;
  airSystem: View3DAirSystem;
  direction: Point3D;
  anchorPosition: Point3D;
  diameterMeters: number;
  isCritical: boolean;
}

export interface View3DAhuEndpointDescriptor {
  id: string;
  type: "ahu";
  label: string;
  position: Point3D;
  isCritical: boolean;
  connectionDirection: null;
  connectedDuctDiameterMeters: null;
  geometry: {
    type: "ahu";
    widthMeters: number;
    depthMeters: number;
    heightMeters: number;
    ports: View3DAhuPortDescriptor[];
  };
}

export interface View3DTerminalEndpointDescriptor {
  id: string;
  type: "terminal";
  label: string;
  position: Point3D;
  isCritical: boolean;
  connectionDirection: Point3D | null;
  connectedDuctDiameterMeters: number | null;
  geometry: {
    type: "terminal";
    markerSizeMeters: number;
    terminalType: TerminalDeviceType;
  };
}

export type View3DEndpointDescriptor =
  | View3DAhuEndpointDescriptor
  | View3DTerminalEndpointDescriptor;

export interface View3DSceneData {
  ducts: View3DDuctDescriptor[];
  endpoints: View3DEndpointDescriptor[];
  bounds: View3DBounds | null;
}

export function buildView3DSceneData(
  document: EditorDocument,
  analysis: RouteAnalysisResult | null,
  ductAirSystems: Record<string, AirSystemType>
): View3DSceneData {
  const criticalComponentIds = new Set(analysis?.criticalPath?.componentIds ?? []);
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const connectedDuctsByNodeId = createConnectedDuctsByNodeId(document, nodeById);
  const endpoints: View3DEndpointDescriptor[] = [];
  const ductAnchorByEdgeKey = new Map<string, Point3D>();

  for (const component of document.components) {
    if (component.type !== "ahu" && component.type !== "terminal") {
      continue;
    }

    const node = nodeById.get(component.nodeIds[0]);

    if (!node) {
      continue;
    }

    if (component.type === "ahu") {
      const endpoint = createAhuDescriptor(
        component,
        node,
        criticalComponentIds.has(component.id),
        connectedDuctsByNodeId.get(node.id) ?? [],
        criticalComponentIds
      );

      endpoints.push(endpoint);

      for (const port of endpoint.geometry.ports) {
        ductAnchorByEdgeKey.set(
          createDuctAnchorKey(port.connectedDuctId, node.id),
          port.anchorPosition
        );
      }

      continue;
    }

    endpoints.push(
      createTerminalDescriptor(
        component,
        node,
        criticalComponentIds.has(component.id),
        connectedDuctsByNodeId.get(node.id) ?? []
      )
    );
  }

  const ducts: View3DDuctDescriptor[] = [];

  for (const component of document.components) {
    if (component.type === "ductSegment") {
      const startNode = nodeById.get(component.nodeIds[0]);
      const endNode = nodeById.get(component.nodeIds[1]);

      if (!startNode || !endNode) {
        continue;
      }

      ducts.push({
        id: component.id,
        start:
          ductAnchorByEdgeKey.get(createDuctAnchorKey(component.id, startNode.id)) ??
          createElevatedPlanarPoint(startNode.position, DUCT_CENTERLINE_HEIGHT_METERS),
        end:
          ductAnchorByEdgeKey.get(createDuctAnchorKey(component.id, endNode.id)) ??
          createElevatedPlanarPoint(endNode.position, DUCT_CENTERLINE_HEIGHT_METERS),
        diameterMeters: component.geometry.diameterMm / 1000,
        isCritical: criticalComponentIds.has(component.id),
        airSystem: ductAirSystems[component.id] ?? null
      });

      continue;
    }
  }

  return {
    ducts,
    endpoints,
    bounds: createBoundsFromSceneContent(ducts, endpoints)
  };
}

export function createView3DScene(): THREE.Scene {
  const scene = new THREE.Scene();

  scene.background = new THREE.Color("#eff4f7");
  scene.fog = new THREE.Fog("#eff4f7", 16, 42);

  const ambientLight = new THREE.AmbientLight("#ffffff", 1.15);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#fff7ef", 1.5);
  keyLight.position.set(8, 16, 10);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight("#d2f0f4", 0.8);
  fillLight.position.set(-10, 7, -6);
  scene.add(fillLight);

  return scene;
}

export function syncView3DScene(
  scene: THREE.Scene,
  sceneData: View3DSceneData
): void {
  replaceNamedObject(scene, ENVIRONMENT_ROOT_NAME, createEnvironmentRoot(sceneData.bounds));
  replaceNamedObject(scene, NETWORK_ROOT_NAME, createNetworkRoot(sceneData));
}

export function disposeView3DScene(scene: THREE.Scene): void {
  for (const child of [...scene.children]) {
    if (child.name === NETWORK_ROOT_NAME || child.name === ENVIRONMENT_ROOT_NAME) {
      disposeObjectTree(child);
      scene.remove(child);
    }
  }
}

function createNetworkRoot(sceneData: View3DSceneData): THREE.Group {
  const root = new THREE.Group();
  root.name = NETWORK_ROOT_NAME;

  for (const duct of sceneData.ducts) {
    root.add(createDuctMesh(duct));
  }

  for (const endpoint of sceneData.endpoints) {
    root.add(createEndpointObject(endpoint));
  }

  return root;
}

function createEnvironmentRoot(bounds: View3DBounds | null): THREE.Group {
  const root = new THREE.Group();
  root.name = ENVIRONMENT_ROOT_NAME;

  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerZ = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const spanX = bounds ? bounds.maxX - bounds.minX : 6;
  const spanZ = bounds ? bounds.maxZ - bounds.minZ : 6;
  const size = Math.max(8, Math.ceil(Math.max(spanX, spanZ) + 4));

  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.7, 48),
    new THREE.MeshStandardMaterial({
      color: "#f8fbfc",
      roughness: 0.94,
      metalness: 0.02
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(centerX, -0.03, centerZ);
  root.add(plane);

  const grid = new THREE.GridHelper(size, size * 5, "#bdd5dd", "#dce9ee");
  grid.position.set(centerX, 0, centerZ);
  root.add(grid);

  return root;
}

function createDuctMesh(duct: View3DDuctDescriptor): THREE.Mesh {
  const start = toWorldAbsolutePoint(duct.start);
  const end = toWorldAbsolutePoint(duct.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const radius = Math.max(duct.diameterMeters / 2, 0.05);

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 18, 1, false),
    new THREE.MeshStandardMaterial({
      color: duct.isCritical ? "#e5673a" : getAirSystemColor(duct.airSystem),
      roughness: 0.36,
      metalness: 0.18
    })
  );

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  mesh.userData = {
    componentId: duct.id
  };

  return mesh;
}

function createEndpointObject(endpoint: View3DEndpointDescriptor): THREE.Object3D {
  if (endpoint.type === "ahu") {
    return createAhuObject(endpoint);
  }

  return createTerminalObject(endpoint);
}

function createAhuObject(
  endpoint: View3DAhuEndpointDescriptor
): THREE.Object3D {
  const group = new THREE.Group();
  const bodyCenter = toWorldPoint(
    endpoint.position,
    DUCT_CENTERLINE_HEIGHT_METERS
  );
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(
      endpoint.geometry.widthMeters,
      endpoint.geometry.heightMeters,
      endpoint.geometry.depthMeters
    ),
    new THREE.MeshStandardMaterial({
      color: endpoint.isCritical ? "#f09a78" : "#123548",
      roughness: 0.3,
      metalness: 0.12
    })
  );

  body.position.copy(bodyCenter);
  group.add(body);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(
      endpoint.geometry.widthMeters * 0.52,
      endpoint.geometry.heightMeters * 0.18,
      endpoint.geometry.depthMeters * 0.42
    ),
    new THREE.MeshStandardMaterial({
      color: "#f6fbfd",
      roughness: 0.62,
      metalness: 0.08
    })
  );

  cap.position.copy(
    bodyCenter.clone().add(new THREE.Vector3(0, endpoint.geometry.heightMeters * 0.19, 0))
  );
  cap.quaternion.copy(body.quaternion);
  group.add(cap);

  for (const port of endpoint.geometry.ports) {
    const collar = createAhuPortMesh(endpoint, port);

    group.add(collar);
  }

  group.userData = {
    componentId: endpoint.id,
    label: endpoint.label
  };

  return group;
}

function createTerminalObject(
  endpoint: View3DTerminalEndpointDescriptor
): THREE.Object3D {
  const color = endpoint.isCritical ? "#e5673a" : getTerminalColor(endpoint.geometry.terminalType);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.44,
    metalness: 0.06
  });
  const size = Math.max(endpoint.geometry.markerSizeMeters, 0.22);
  const group = new THREE.Group();
  const networkDirection = toWorldDirection(
    endpoint.connectionDirection ?? { x: -1, y: 0, z: 0 }
  );
  const outwardDirection = networkDirection.clone().multiplyScalar(-1);
  const connectionPoint = toWorldPoint(endpoint.position, DUCT_CENTERLINE_HEIGHT_METERS);
  const neckRadius = Math.max(
    (endpoint.connectedDuctDiameterMeters ?? size * 0.4) / 2,
    0.06
  );
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(neckRadius, neckRadius, TERMINAL_NECK_LENGTH_METERS, 18),
    new THREE.MeshStandardMaterial({
      color: "#2c819c",
      roughness: 0.34,
      metalness: 0.18
    })
  );
  neck.position.copy(
    connectionPoint.clone().addScaledVector(outwardDirection, TERMINAL_NECK_LENGTH_METERS / 2)
  );
  neck.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    outwardDirection
  );
  group.add(neck);

  const discRadii = [size * 0.95, size * 0.72, size * 0.48];
  discRadii.forEach((radius, index) => {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, TERMINAL_PLATE_THICKNESS_METERS, 28),
      material
    );
    const offset =
      TERMINAL_NECK_LENGTH_METERS +
      index * (TERMINAL_PLATE_GAP_METERS + TERMINAL_PLATE_THICKNESS_METERS);

    disc.position.copy(
      connectionPoint.clone().addScaledVector(outwardDirection, offset)
    );
    disc.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      outwardDirection
    );
    group.add(disc);
  });

  const centerBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.15, size * 0.2, TERMINAL_PLATE_THICKNESS_METERS * 2, 20),
    new THREE.MeshStandardMaterial({
      color: "#f7fbfd",
      roughness: 0.5,
      metalness: 0.08
    })
  );
  centerBoss.position.copy(
    connectionPoint.clone().addScaledVector(
      outwardDirection,
      TERMINAL_NECK_LENGTH_METERS + TERMINAL_PLATE_GAP_METERS
    )
  );
  centerBoss.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    outwardDirection
  );
  group.add(centerBoss);

  group.userData = {
    componentId: endpoint.id,
    label: endpoint.label
  };

  return group;
}

function createAhuPortMesh(
  endpoint: View3DAhuEndpointDescriptor,
  port: View3DAhuPortDescriptor
): THREE.Mesh {
  const collarRadius = Math.max(port.diameterMeters / 2, 0.08);
  const facePosition = createAhuBodyFacePosition(
    endpoint.position,
    endpoint.geometry,
    port.direction,
    port.anchorPosition
  );
  const start = toWorldAbsolutePoint(facePosition);
  const end = toWorldAbsolutePoint(port.anchorPosition);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 0.01);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(collarRadius, collarRadius, length, 18),
    new THREE.MeshStandardMaterial({
      color: port.isCritical ? "#e5673a" : getAirSystemColor(port.airSystem),
      roughness: 0.34,
      metalness: 0.16
    })
  );

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );

  return mesh;
}

function createAhuBodyFacePosition(
  centerPosition: Point3D,
  geometry: View3DAhuEndpointDescriptor["geometry"],
  direction: Point3D,
  anchorPosition: Point3D
): Point3D {
  if (Math.abs(direction.x) >= Math.abs(direction.y)) {
    return {
      x:
        centerPosition.x +
        Math.sign(direction.x || 1) * (geometry.widthMeters / 2),
      y: anchorPosition.y,
      z: anchorPosition.z
    };
  }

  return {
    x: anchorPosition.x,
    y:
      centerPosition.y +
      Math.sign(direction.y || 1) * (geometry.depthMeters / 2),
    z: anchorPosition.z
  };
}

function createAhuDescriptor(
  component: AhuComponent,
  node: DuctNode,
  isCritical: boolean,
  connectedDucts: ConnectedDuctDescriptor[],
  criticalComponentIds: Set<string>
): View3DAhuEndpointDescriptor {
  const ports = createAhuPortDescriptors(
    component,
    node,
    connectedDucts,
    criticalComponentIds
  );

  return {
    id: component.id,
    type: "ahu",
    label: component.metadata.label,
    position: node.position,
    isCritical,
    connectionDirection: null,
    connectedDuctDiameterMeters: null,
    geometry: {
      type: "ahu",
      widthMeters: component.geometry.widthMeters,
      depthMeters: component.geometry.depthMeters,
      heightMeters: component.geometry.heightMeters,
      ports
    }
  };
}

function createTerminalDescriptor(
  component: TerminalDeviceComponent,
  node: DuctNode,
  isCritical: boolean,
  connectedDucts: ConnectedDuctDescriptor[]
): View3DTerminalEndpointDescriptor {
  const connection = resolveEndpointConnection(node.position, connectedDucts);

  return {
    id: component.id,
    type: "terminal",
    label: component.metadata.label,
    position: node.position,
    isCritical,
    connectionDirection: connection.direction,
    connectedDuctDiameterMeters: connection.connectedDuctDiameterMeters,
    geometry: {
      type: "terminal",
      markerSizeMeters: component.geometry.markerSizeMeters,
      terminalType: component.metadata.terminalType
    }
  };
}

function createBoundsFromSceneContent(
  ducts: View3DDuctDescriptor[],
  endpoints: View3DEndpointDescriptor[]
): View3DBounds | null {
  const xValues: number[] = [];
  const zValues: number[] = [];
  const yValues: number[] = [0];

  for (const duct of ducts) {
    xValues.push(duct.start.x, duct.end.x);
    zValues.push(duct.start.y, duct.end.y);
    yValues.push(duct.start.z, duct.end.z);
  }

  for (const endpoint of endpoints) {
    if (endpoint.geometry.type === "ahu") {
      xValues.push(
        endpoint.position.x - endpoint.geometry.widthMeters / 2 - AHU_COLLAR_LENGTH_METERS,
        endpoint.position.x + endpoint.geometry.widthMeters / 2 + AHU_COLLAR_LENGTH_METERS
      );
      zValues.push(
        endpoint.position.y - endpoint.geometry.depthMeters / 2 - AHU_COLLAR_LENGTH_METERS,
        endpoint.position.y + endpoint.geometry.depthMeters / 2 + AHU_COLLAR_LENGTH_METERS
      );
      yValues.push(DUCT_CENTERLINE_HEIGHT_METERS + endpoint.geometry.heightMeters / 2);

      for (const port of endpoint.geometry.ports) {
        xValues.push(port.anchorPosition.x);
        zValues.push(port.anchorPosition.y);
        yValues.push(port.anchorPosition.z);
      }
    } else {
      const span = endpoint.geometry.markerSizeMeters;

      xValues.push(endpoint.position.x - span, endpoint.position.x + span);
      zValues.push(endpoint.position.y - span, endpoint.position.y + span);
      yValues.push(DUCT_CENTERLINE_HEIGHT_METERS + TERMINAL_NECK_LENGTH_METERS + span * 0.95);
    }
  }

  if (xValues.length === 0 || zValues.length === 0) {
    return null;
  }

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minZ: Math.min(...zValues),
    maxZ: Math.max(...zValues),
    maxY: Math.max(...yValues) + 1.2
  };
}

function toWorldPoint(point: Point3D, elevationMeters: number): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z + elevationMeters, point.y);
}

function toWorldAbsolutePoint(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z, point.y);
}

function toWorldDirection(vector: Point3D): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.z, vector.y).normalize();
}

interface ConnectedDuctDescriptor {
  componentId: string;
  otherNodePosition: Point3D;
  diameterMeters: number;
  ahuConnection: DuctAhuConnection | null;
}

function createConnectedDuctsByNodeId(
  document: EditorDocument,
  nodeById: Map<string, DuctNode>
): Map<string, ConnectedDuctDescriptor[]> {
  const connectedDuctsByNodeId = new Map<string, ConnectedDuctDescriptor[]>();

  for (const component of document.components) {
    if (component.type !== "ductSegment") {
      continue;
    }

    const startNode = nodeById.get(component.nodeIds[0]);
    const endNode = nodeById.get(component.nodeIds[1]);

    if (!startNode || !endNode) {
      continue;
    }

    addConnectedDuctDescriptor(connectedDuctsByNodeId, startNode.id, {
      componentId: component.id,
      otherNodePosition: endNode.position,
      diameterMeters: component.geometry.diameterMm / 1000,
      ahuConnection: component.metadata.ahuConnection
    });
    addConnectedDuctDescriptor(connectedDuctsByNodeId, endNode.id, {
      componentId: component.id,
      otherNodePosition: startNode.position,
      diameterMeters: component.geometry.diameterMm / 1000,
      ahuConnection: component.metadata.ahuConnection
    });
  }

  return connectedDuctsByNodeId;
}

function addConnectedDuctDescriptor(
  connectedDuctsByNodeId: Map<string, ConnectedDuctDescriptor[]>,
  nodeId: string,
  descriptor: ConnectedDuctDescriptor
): void {
  const connectedDucts = connectedDuctsByNodeId.get(nodeId) ?? [];

  connectedDucts.push(descriptor);
  connectedDuctsByNodeId.set(nodeId, connectedDucts);
}

function createAhuPortDescriptors(
  component: AhuComponent,
  node: DuctNode,
  connectedDucts: ConnectedDuctDescriptor[],
  criticalComponentIds: Set<string>
): View3DAhuPortDescriptor[] {
  const anchors = getAhuPortAnchors(
    component,
    node.position,
    DEFAULT_AHU_PORT_OFFSET_METERS
  );

  return anchors.map((anchor) => {
    const connectedDuct = connectedDucts.find(
      (candidate) => candidate.ahuConnection?.portType === anchor.portType
    );

    return {
      id: `ahu-port:${component.id}:${anchor.portType}`,
      connectedDuctId: connectedDuct?.componentId ?? `${component.id}:${anchor.portType}`,
      airSystem: anchor.portType,
      direction: anchor.direction,
      anchorPosition: {
        x: anchor.position.x,
        y: anchor.position.y,
        z: DUCT_CENTERLINE_HEIGHT_METERS
      },
      diameterMeters: connectedDuct?.diameterMeters ?? 0.25,
      isCritical: connectedDuct ? criticalComponentIds.has(connectedDuct.componentId) : false
    };
  });
}

function createDuctAnchorKey(componentId: string, nodeId: string): string {
  return `${componentId}::${nodeId}`;
}

function createElevatedPlanarPoint(
  position: Point3D,
  elevationMeters: number
): Point3D {
  return {
    x: position.x,
    y: position.y,
    z: elevationMeters
  };
}

function resolveEndpointConnection(
  endpointPosition: Point3D,
  connectedDucts: ConnectedDuctDescriptor[]
): {
  direction: Point3D | null;
  connectedDuctDiameterMeters: number | null;
} {
  const primaryConnection = connectedDucts[0];

  if (!primaryConnection) {
    return {
      direction: null,
      connectedDuctDiameterMeters: null
    };
  }

  const direction = createNormalizedPlanarDirection(
    endpointPosition,
    primaryConnection.otherNodePosition
  );

  return {
    direction,
    connectedDuctDiameterMeters: primaryConnection.diameterMeters
  };
}

function createNormalizedPlanarDirection(
  startPoint: Point3D,
  endPoint: Point3D
): Point3D | null {
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) {
    return null;
  }

  return {
    x: deltaX / length,
    y: deltaY / length,
    z: 0
  };
}

function replaceNamedObject(
  scene: THREE.Scene,
  objectName: string,
  nextObject: THREE.Object3D
): void {
  const previousObject = scene.getObjectByName(objectName);

  if (previousObject) {
    disposeObjectTree(previousObject);
    scene.remove(previousObject);
  }

  scene.add(nextObject);
}

function disposeObjectTree(object: THREE.Object3D): void {
  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          material.dispose();
        }
      } else {
        mesh.material.dispose();
      }
    }
  });
}

function getTerminalColor(terminalType: TerminalDeviceType): string {
  switch (terminalType) {
    case "supply":
      return "#2c819c";
    case "exhaust":
      return "#d4aa2a";
    case "outdoor":
      return "#2b8f55";
    case "exhaustAir":
      return "#8b5a2b";
  }

  throw new Error(`Unsupported terminal type "${terminalType}".`);
}
