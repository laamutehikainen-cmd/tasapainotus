import * as THREE from "three";
import {
  getAirSystemColor,
  mapTerminalTypeToAirSystem,
  type AirSystemType
} from "../airSystems";
import type { TerminalDeviceType } from "../components";
import type { Point3D } from "../core/geometry";
import type {
  View3DSceneData,
  View3DTerminalEndpointDescriptor
} from "./scene";

const FLOW_ANIMATION_ROOT_NAME = "flow-animation-root";
const TERMINAL_STREAM_ROOT_NAME = "terminal-flow-root";
const DUCT_PARTICLE_ROOT_NAME = "duct-particle-root";
const DUCT_CENTERLINE_HEIGHT_METERS = 1.8;
const DEFAULT_PARTICLE_SPEED_METERS_PER_SECOND = 0.9;
const REDUCED_MOTION_PARTICLE_SPEED_METERS_PER_SECOND = 0;

export interface FlowAnimationOptions {
  reducedMotion?: boolean;
}

export interface FlowParticleDescriptor {
  id: string;
  ductId: string;
  airSystem: AirSystemType;
  start: Point3D;
  end: Point3D;
  radiusMeters: number;
  phaseOffset: number;
  speedMetersPerSecond: number;
}

export interface TerminalFlowDescriptor {
  id: string;
  terminalId: string;
  terminalType: TerminalDeviceType;
  airSystem: AirSystemType;
  mode: "throw" | "intake";
  start: Point3D;
  end: Point3D;
  strength: number;
}

export interface FlowAnimationData {
  fanRunning: boolean;
  reducedMotion: boolean;
  particles: FlowParticleDescriptor[];
  terminalStreams: TerminalFlowDescriptor[];
}

export interface FlowAnimationController {
  sync: (sceneData: View3DSceneData, options?: FlowAnimationOptions) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

interface ParticleRuntime {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
  lengthMeters: number;
  phaseOffset: number;
  speedMetersPerSecond: number;
}

interface OpacityRuntime {
  material: THREE.Material;
  baseOpacity: number;
}

export function createFlowAnimationData(
  sceneData: View3DSceneData,
  options: FlowAnimationOptions = {}
): FlowAnimationData {
  const reducedMotion = options.reducedMotion ?? false;

  return {
    fanRunning: sceneData.fanRunning,
    reducedMotion,
    particles: createDuctFlowParticles(sceneData, reducedMotion),
    terminalStreams: createTerminalFlowDescriptors(sceneData)
  };
}

export function createFlowAnimationController(
  scene: THREE.Scene
): FlowAnimationController {
  const root = new THREE.Group();
  const particleRoot = new THREE.Group();
  const terminalRoot = new THREE.Group();
  const particleRuntimes: ParticleRuntime[] = [];
  const opacityRuntimes: OpacityRuntime[] = [];
  let opacity = 0;
  let targetOpacity = 0;
  let elapsedSeconds = 0;

  root.name = FLOW_ANIMATION_ROOT_NAME;
  particleRoot.name = DUCT_PARTICLE_ROOT_NAME;
  terminalRoot.name = TERMINAL_STREAM_ROOT_NAME;
  root.add(particleRoot, terminalRoot);
  scene.add(root);

  return {
    sync(sceneData: View3DSceneData, options: FlowAnimationOptions = {}): void {
      const animationData = createFlowAnimationData(sceneData, options);

      clearGroup(particleRoot);
      clearGroup(terminalRoot);
      particleRuntimes.length = 0;
      opacityRuntimes.length = 0;

      for (const particle of animationData.particles) {
        const runtime = createParticleRuntime(particle);

        particleRoot.add(runtime.mesh);
        particleRuntimes.push(runtime);
        collectOpacityRuntime(runtime.mesh, opacityRuntimes, 0.92);
      }

      for (const stream of animationData.terminalStreams) {
        const streamObject = createTerminalStreamObject(stream);

        terminalRoot.add(streamObject);
        collectOpacityRuntime(streamObject, opacityRuntimes, 0.26);
      }

      targetOpacity = animationData.fanRunning ? 1 : 0;
      root.visible = opacity > 0.01 || targetOpacity > 0;
      applyOpacity(opacityRuntimes, opacity);
    },
    update(deltaSeconds: number): void {
      elapsedSeconds += Math.max(deltaSeconds, 0);
      opacity +=
        (targetOpacity - opacity) *
        Math.min(1, Math.max(deltaSeconds, 0) * 5);
      root.visible = opacity > 0.01 || targetOpacity > 0;

      for (const runtime of particleRuntimes) {
        updateParticleRuntime(runtime, elapsedSeconds);
      }

      applyOpacity(opacityRuntimes, opacity);
    },
    dispose(): void {
      clearGroup(root);
      scene.remove(root);
    }
  };
}

function createDuctFlowParticles(
  sceneData: View3DSceneData,
  reducedMotion: boolean
): FlowParticleDescriptor[] {
  return sceneData.ducts.flatMap((duct) => {
    const airSystem = duct.airSystem;

    if (!duct.flowStart || !duct.flowEnd || !airSystem) {
      return [];
    }

    const lengthMeters = calculatePointDistance(duct.flowStart, duct.flowEnd);
    const particleCount = reducedMotion
      ? 1
      : Math.max(1, Math.min(6, Math.ceil(lengthMeters / 1.2)));

    return Array.from({ length: particleCount }, (_, index) => ({
      id: `${duct.id}:flow:${index}`,
      ductId: duct.id,
      airSystem,
      start: duct.flowStart!,
      end: duct.flowEnd!,
      radiusMeters: Math.max(0.035, Math.min(0.09, duct.diameterMeters * 0.22)),
      phaseOffset: reducedMotion ? 0.5 : index / particleCount,
      speedMetersPerSecond: reducedMotion
        ? REDUCED_MOTION_PARTICLE_SPEED_METERS_PER_SECOND
        : DEFAULT_PARTICLE_SPEED_METERS_PER_SECOND
    }));
  });
}

function createTerminalFlowDescriptors(
  sceneData: View3DSceneData
): TerminalFlowDescriptor[] {
  return sceneData.endpoints.flatMap((endpoint) => {
    if (endpoint.type !== "terminal" || !endpoint.connectionDirection) {
      return [];
    }

    return [
      createTerminalFlowDescriptor(
        endpoint,
        calculateTerminalThrowDistanceMeters(
          endpoint.geometry.referencePressureLossPa
        )
      )
    ];
  });
}

function createTerminalFlowDescriptor(
  endpoint: View3DTerminalEndpointDescriptor,
  throwDistanceMeters: number
): TerminalFlowDescriptor {
  const terminalPoint = elevatePoint(endpoint.position, DUCT_CENTERLINE_HEIGHT_METERS);
  const outwardDirection = normalizePlanarPoint({
    x: -endpoint.connectionDirection!.x,
    y: -endpoint.connectionDirection!.y,
    z: 0
  });
  const airSystem = mapTerminalTypeToAirSystem(endpoint.geometry.terminalType);
  const mode = isTerminalThrowMode(endpoint.geometry.terminalType)
    ? "throw"
    : "intake";
  const roomPoint = {
    x: terminalPoint.x + outwardDirection.x * throwDistanceMeters,
    y: terminalPoint.y + outwardDirection.y * throwDistanceMeters,
    z: terminalPoint.z
  };

  return {
    id: `${endpoint.id}:terminal-flow`,
    terminalId: endpoint.id,
    terminalType: endpoint.geometry.terminalType,
    airSystem,
    mode,
    start: mode === "throw" ? terminalPoint : roomPoint,
    end: mode === "throw" ? roomPoint : terminalPoint,
    strength: throwDistanceMeters
  };
}

function isTerminalThrowMode(terminalType: TerminalDeviceType): boolean {
  return terminalType === "supply" || terminalType === "exhaustAir";
}

export function calculateTerminalThrowDistanceMeters(
  referencePressureLossPa: number
): number {
  if (!Number.isFinite(referencePressureLossPa) || referencePressureLossPa <= 0) {
    return 0.35;
  }

  return Number(
    Math.max(
      0.35,
      Math.min(1.8, 0.22 + Math.sqrt(referencePressureLossPa) / 8)
    ).toFixed(3)
  );
}

function createParticleRuntime(
  particle: FlowParticleDescriptor
): ParticleRuntime {
  const material = new THREE.MeshStandardMaterial({
    color: getAirSystemColor(particle.airSystem),
    roughness: 0.32,
    metalness: 0.08,
    transparent: true,
    opacity: 0
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(particle.radiusMeters, 14, 10),
    material
  );
  const start = toWorldPoint(particle.start);
  const end = toWorldPoint(particle.end);
  const lengthMeters = Math.max(start.distanceTo(end), 0.001);

  mesh.userData = {
    componentId: particle.ductId,
    role: "flow-particle"
  };

  return {
    mesh,
    start,
    end,
    lengthMeters,
    phaseOffset: particle.phaseOffset,
    speedMetersPerSecond: particle.speedMetersPerSecond
  };
}

function createTerminalStreamObject(
  stream: TerminalFlowDescriptor
): THREE.Object3D {
  const start = toWorldPoint(stream.start);
  const end = toWorldPoint(stream.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const lengthMeters = Math.max(direction.length(), 0.001);
  const color = getAirSystemColor(stream.airSystem);
  const group = new THREE.Group();
  const streamMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.07, lengthMeters, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.38,
      metalness: 0.04,
      transparent: true,
      opacity: 0
    })
  );
  const arrowMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.18, 18),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.36,
      metalness: 0.05,
      transparent: true,
      opacity: 0
    })
  );

  streamMesh.position.copy(start).add(end).multiplyScalar(0.5);
  streamMesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  arrowMesh.position.copy(end);
  arrowMesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  group.userData = {
    componentId: stream.terminalId,
    role: stream.mode === "throw" ? "terminal-throw" : "terminal-intake"
  };
  group.add(streamMesh, arrowMesh);

  return group;
}

function updateParticleRuntime(
  runtime: ParticleRuntime,
  elapsedSeconds: number
): void {
  const movingDistance =
    (elapsedSeconds * runtime.speedMetersPerSecond) / runtime.lengthMeters;
  const progress =
    runtime.speedMetersPerSecond === 0
      ? runtime.phaseOffset
      : (movingDistance + runtime.phaseOffset) % 1;

  runtime.mesh.position.copy(runtime.start).lerp(runtime.end, progress);
}

function collectOpacityRuntime(
  object: THREE.Object3D,
  opacityRuntimes: OpacityRuntime[],
  baseOpacity: number
): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

    if (!mesh.material || Array.isArray(mesh.material)) {
      return;
    }

    mesh.material.transparent = true;
    opacityRuntimes.push({
      material: mesh.material,
      baseOpacity
    });
  });
}

function applyOpacity(
  opacityRuntimes: OpacityRuntime[],
  opacity: number
): void {
  for (const runtime of opacityRuntimes) {
    runtime.material.opacity = runtime.baseOpacity * opacity;
  }
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeObjectTree(child);
    group.remove(child);
  }
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

function calculatePointDistance(start: Point3D, end: Point3D): number {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

function elevatePoint(point: Point3D, elevationMeters: number): Point3D {
  return {
    x: point.x,
    y: point.y,
    z: elevationMeters
  };
}

function normalizePlanarPoint(point: Point3D): Point3D {
  const length = Math.hypot(point.x, point.y);

  if (length === 0) {
    return {
      x: 1,
      y: 0,
      z: 0
    };
  }

  return {
    x: point.x / length,
    y: point.y / length,
    z: 0
  };
}

function toWorldPoint(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z, point.y);
}
