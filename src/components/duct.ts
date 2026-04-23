import type { NodeId } from "../core/nodes";
import type { AhuPortType } from "../airSystems";
import {
  assertNonEmptyId,
  assertNonNegativeNumber,
  assertPositiveNumber,
  createFlowData,
  type InlineComponent
} from "./base";

export type DuctMaterial = "galvanizedSteel" | "unspecified";

export interface DuctGeometry {
  shape: "round";
  diameterMm: number;
  lengthMeters: number;
}

export interface DuctMetadata {
  label?: string;
  material: DuctMaterial;
  roughnessMm: number;
  localLossCoefficient: number;
  ahuConnection: DuctAhuConnection | null;
}

export interface DuctAhuConnection {
  componentId: string;
  nodeId: NodeId;
  portType: AhuPortType;
}

export interface CreateDuctSegmentInput {
  id: string;
  startNodeId: NodeId;
  endNodeId: NodeId;
  diameterMm: number;
  lengthMeters: number;
  designFlowRateLps?: number;
  material?: DuctMaterial;
  roughnessMm?: number;
  localLossCoefficient?: number;
  label?: string;
  ahuConnection?: DuctAhuConnection | null;
}

export type DuctSegmentComponent = InlineComponent<
  "ductSegment",
  DuctGeometry,
  DuctMetadata
>;

export const DEFAULT_GALVANIZED_STEEL_ROUGHNESS_MM = 0.09;

export function createDuctSegment(
  input: CreateDuctSegmentInput
): DuctSegmentComponent {
  assertNonEmptyId(input.id, "Duct segment id");
  assertNonEmptyId(input.startNodeId, "Duct segment start node id");
  assertNonEmptyId(input.endNodeId, "Duct segment end node id");

  if (input.startNodeId === input.endNodeId) {
    throw new Error("Duct segment must connect two different nodes.");
  }

  assertPositiveNumber(input.diameterMm, "Duct diameterMm");
  assertPositiveNumber(input.lengthMeters, "Duct lengthMeters");

  if (input.designFlowRateLps !== undefined) {
    assertPositiveNumber(input.designFlowRateLps, "Duct designFlowRateLps");
  }

  if (input.roughnessMm !== undefined) {
    assertNonNegativeNumber(input.roughnessMm, "Duct roughnessMm");
  }

  if (input.localLossCoefficient !== undefined) {
    assertNonNegativeNumber(
      input.localLossCoefficient,
      "Duct localLossCoefficient"
    );
  }

  return {
    id: input.id,
    type: "ductSegment",
    nodeIds: [input.startNodeId, input.endNodeId],
    geometry: {
      shape: "round",
      diameterMm: input.diameterMm,
      lengthMeters: input.lengthMeters
    },
    flow: createFlowData(input.designFlowRateLps ?? null),
    pressureLossPa: null,
    metadata: {
      label: input.label,
      material: input.material ?? "galvanizedSteel",
      roughnessMm:
        input.roughnessMm ?? DEFAULT_GALVANIZED_STEEL_ROUGHNESS_MM,
      localLossCoefficient: input.localLossCoefficient ?? 0,
      ahuConnection: input.ahuConnection ?? null
    }
  };
}
