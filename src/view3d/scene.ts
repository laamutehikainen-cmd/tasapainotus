import * as THREE from "three";
import type { TerminalRouteResult } from "../calc/routes";
import type {
  AhuComponent,
  TerminalDeviceComponent,
  TerminalDeviceType
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
}

export interface View3DEndpointDescriptor {
  id: string;
  type: "ahu" | "terminal";
  label: string;
  position: Point3D;
  isCritical: boolean;
  connectionDirection: Point3D | null;
  connectedDuctDiameterMeters: number | null;
  geometry:
    | {
        type: "ahu";
        widthMeters: number;
        depthMeters: number;
        heightMeters: number;
      }
    | {
        type: "terminal";
        markerSizeMeters: number;
        terminalType: TerminalDeviceType;
      };
}

export interface View3DSceneData {
  ducts: View3DDuctDescriptor[];
  endpoints: View3DEndpointDescriptor[];
  bounds: View3DBounds | null;
}

export function buildView3DSceneData(
  document: EditorDocument,
  criticalPath: TerminalRouteResult | null
): View3DSceneData {
  const criticalComponentIds = new Set(criticalPath?.componentIds ?? []);
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const connectedDuctsByNodeId = createConnectedDuctsByNodeId(document, nodeById);
  const ducts: View3DDuctDescriptor[] = [];
  const endpoints: View3DEndpointDescriptor[] = [];

  for (const component of document.components) {
    if (component.type === "ductSegment") {
      const startNode = nodeById.get(component.nodeIds[0]);
      const endNode = nodeById.get(component.nodeIds[1]);

      if (!startNode || !endNode) {
        continue;
      }

      ducts.push({
        id: component.id,
        start: startNode.position,
        end: endNode.position,
        diameterMeters: component.geometry.diameterMm / 1000,
        isCritical: criticalComponentIds.has(component.id)
      });

      continue;
    }

    const node = nodeById.get(component.nodeIds[0]);

    if (!node) {
      continue;
    }

    if (component.type === "ahu") {
      endpoints.push(
        createAhuDescriptor(
          component,
          node,
          criticalComponentIds.has(component.id),
          connectedDuctsByNodeId.get(node.id) ?? []
        )
      );

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

  return {
    ducts,
    endpoints,
    bounds: createBoundsFromNodes(document.nodes)
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
  const start = toWorldPoint(duct.start, DUCT_CENTERLINE_HEIGHT_METERS);
  const end = toWorldPoint(duct.end, DUCT_CENTERLINE_HEIGHT_METERS);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const radius = Math.max(duct.diameterMeters / 2, 0.05);

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 18, 1, false),
    new THREE.MeshStandardMaterial({
      color: duct.isCritical ? "#e5673a" : "#2c819c",
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

function createAhuObject(endpoint: View3DEndpointDescriptor): THREE.Object3D {
  if (endpoint.geometry.type !== "ahu") {
    throw new Error("Expected AHU geometry for AHU endpoint.");
  }

  const group = new THREE.Group();
  const connectionDirection = toWorldDirection(
    endpoint.connectionDirection ?? { x: 1, y: 0, z: 0 }
  );
  const connectionPoint = toWorldPoint(endpoint.position, DUCT_CENTERLINE_HEIGHT_METERS);
  const collarRadius = Math.max(
    (endpoint.connectedDuctDiameterMeters ?? 0.28) / 2,
    0.08
  );
  const bodyCenter = connectionPoint
    .clone()
    .addScaledVector(
      connectionDirection,
      -(AHU_COLLAR_LENGTH_METERS + endpoint.geometry.widthMeters / 2)
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
  body.quaternion.setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    connectionDirection
  );
  group.add(body);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(collarRadius, collarRadius, AHU_COLLAR_LENGTH_METERS, 18),
    new THREE.MeshStandardMaterial({
      color: endpoint.isCritical ? "#f09a78" : "#2c819c",
      roughness: 0.34,
      metalness: 0.16
    })
  );
  collar.position.copy(
    connectionPoint
      .clone()
      .addScaledVector(connectionDirection, -AHU_COLLAR_LENGTH_METERS / 2)
  );
  collar.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    connectionDirection
  );
  group.add(collar);

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
  group.userData = {
    componentId: endpoint.id,
    label: endpoint.label
  };

  return group;
}

function createTerminalObject(
  endpoint: View3DEndpointDescriptor
): THREE.Object3D {
  if (endpoint.geometry.type !== "terminal") {
    throw new Error("Expected terminal geometry for terminal endpoint.");
  }

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

function createAhuDescriptor(
  component: AhuComponent,
  node: DuctNode,
  isCritical: boolean,
  connectedDucts: ConnectedDuctDescriptor[]
): View3DEndpointDescriptor {
  const connection = resolveEndpointConnection(node.position, connectedDucts);

  return {
    id: component.id,
    type: "ahu",
    label: component.metadata.label,
    position: node.position,
    isCritical,
    connectionDirection: connection.direction,
    connectedDuctDiameterMeters: connection.connectedDuctDiameterMeters,
    geometry: {
      type: "ahu",
      widthMeters: component.geometry.widthMeters,
      depthMeters: component.geometry.depthMeters,
      heightMeters: component.geometry.heightMeters
    }
  };
}

function createTerminalDescriptor(
  component: TerminalDeviceComponent,
  node: DuctNode,
  isCritical: boolean,
  connectedDucts: ConnectedDuctDescriptor[]
): View3DEndpointDescriptor {
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

function createBoundsFromNodes(nodes: DuctNode[]): View3DBounds | null {
  if (nodes.length === 0) {
    return null;
  }

  const xValues = nodes.map((node) => node.position.x);
  const zValues = nodes.map((node) => node.position.y);
  const yValues = nodes.map((node) => node.position.z);

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minZ: Math.min(...zValues),
    maxZ: Math.max(...zValues),
    maxY: Math.max(...yValues) + DUCT_CENTERLINE_HEIGHT_METERS + 1.2
  };
}

function toWorldPoint(point: Point3D, elevationMeters: number): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z + elevationMeters, point.y);
}

function toWorldDirection(vector: Point3D): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.z, vector.y).normalize();
}

interface ConnectedDuctDescriptor {
  otherNodePosition: Point3D;
  diameterMeters: number;
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
      otherNodePosition: endNode.position,
      diameterMeters: component.geometry.diameterMm / 1000
    });
    addConnectedDuctDescriptor(connectedDuctsByNodeId, endNode.id, {
      otherNodePosition: startNode.position,
      diameterMeters: component.geometry.diameterMm / 1000
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
      return "#134c5e";
    case "outdoor":
      return "#4b9ac8";
    case "exhaustAir":
      return "#51717e";
  }

  throw new Error(`Unsupported terminal type "${terminalType}".`);
}
