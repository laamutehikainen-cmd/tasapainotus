import type { NodeId } from "../core/nodes";
import type { Point3D } from "../core/geometry";
import {
  assertNonEmptyId,
  assertNonNegativeNumber,
  assertPositiveNumber,
  createFlowData,
  type EndpointComponent
} from "./base";
import { AHU_PORT_SPECS, type AhuPortType } from "../airSystems";
import { DEFAULT_AHU_DEVICE_PRESSURE_LOSS_PA } from "../data/defaultTerminalPressureLosses";

export type AhuSystemType = "supply" | "exhaust" | "mixed";

export interface AhuGeometry {
  widthMeters: number;
  depthMeters: number;
  heightMeters: number;
}

export interface AhuMetadata {
  label: string;
  systemType: AhuSystemType;
  rotationDegrees: number;
  devicePressureLossPa: number;
  fanRunning: boolean;
}

export interface CreateAhuInput {
  id: string;
  nodeId: NodeId;
  label?: string;
  systemType?: AhuSystemType;
  rotationDegrees?: number;
  devicePressureLossPa?: number;
  fanRunning?: boolean;
  geometry?: Partial<AhuGeometry>;
}

export type AhuComponent = EndpointComponent<"ahu", AhuGeometry, AhuMetadata>;
export const DEFAULT_AHU_PORT_OFFSET_METERS = 0.24;

export interface AhuPortAnchor {
  portType: AhuPortType;
  label: string;
  shortLabel: string;
  color: string;
  position: Point3D;
  direction: Point3D;
}

const DEFAULT_AHU_GEOMETRY: AhuGeometry = {
  widthMeters: 2.2,
  depthMeters: 1.2,
  heightMeters: 1.6
};

export function createAhu(input: CreateAhuInput): AhuComponent {
  assertNonEmptyId(input.id, "AHU id");
  assertNonEmptyId(input.nodeId, "AHU node id");

  const geometry: AhuGeometry = {
    ...DEFAULT_AHU_GEOMETRY,
    ...(input.geometry ?? {})
  };

  assertPositiveNumber(geometry.widthMeters, "AHU widthMeters");
  assertPositiveNumber(geometry.depthMeters, "AHU depthMeters");
  assertPositiveNumber(geometry.heightMeters, "AHU heightMeters");
  assertNonNegativeNumber(
    input.devicePressureLossPa ?? DEFAULT_AHU_DEVICE_PRESSURE_LOSS_PA,
    "AHU devicePressureLossPa"
  );

  return {
    id: input.id,
    type: "ahu",
    nodeIds: [input.nodeId],
    geometry,
    flow: createFlowData(),
    pressureLossPa: null,
    metadata: {
      label: input.label ?? input.id,
      systemType: input.systemType ?? "supply",
      rotationDegrees: normalizeAhuRotationDegrees(input.rotationDegrees ?? 0),
      devicePressureLossPa:
        input.devicePressureLossPa ?? DEFAULT_AHU_DEVICE_PRESSURE_LOSS_PA,
      fanRunning: input.fanRunning ?? false
    }
  };
}

export function normalizeAhuRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return ((Math.round(value) % 360) + 360) % 360;
}

export function getAhuPortAnchors(
  component: AhuComponent,
  centerPosition: Point3D,
  offsetMeters = DEFAULT_AHU_PORT_OFFSET_METERS
): AhuPortAnchor[] {
  const rotationRadians =
    (normalizeAhuRotationDegrees(component.metadata.rotationDegrees) * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);

  return AHU_PORT_SPECS.map((spec) => {
    const halfWidthMeters =
      component.geometry.widthMeters / 2 + (spec.localDirection.x !== 0 ? offsetMeters : 0);
    const halfDepthMeters =
      component.geometry.depthMeters / 2 + (spec.localDirection.y !== 0 ? offsetMeters : 0);
    const localX = spec.localDirection.x * halfWidthMeters;
    const localY = spec.localDirection.y * halfDepthMeters;
    const rotatedX = localX * cos - localY * sin;
    const rotatedY = localX * sin + localY * cos;
    const directionX =
      spec.localDirection.x * cos - spec.localDirection.y * sin;
    const directionY =
      spec.localDirection.x * sin + spec.localDirection.y * cos;

    return {
      portType: spec.portType,
      label: spec.label,
      shortLabel: spec.shortLabel,
      color: spec.color,
      position: {
        x: Number((centerPosition.x + rotatedX).toFixed(3)),
        y: Number((centerPosition.y + rotatedY).toFixed(3)),
        z: centerPosition.z
      },
      direction: {
        x: Number(directionX.toFixed(6)),
        y: Number(directionY.toFixed(6)),
        z: 0
      }
    };
  });
}
