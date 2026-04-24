import type { NodeId } from "../core/nodes";
import {
  assertNonEmptyId,
  assertPositiveNumber,
  createFlowData,
  type EndpointComponent
} from "./base";
import { DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA } from "../data/defaultTerminalPressureLosses";

export type TerminalDeviceType =
  | "supply"
  | "exhaust"
  | "outdoor"
  | "exhaustAir";

export interface TerminalGeometry {
  markerSizeMeters: number;
}

export interface TerminalMetadata {
  label: string;
  terminalType: TerminalDeviceType;
  referencePressureLossPa: number;
  referencePressureLossSource: "default" | "override";
}

export interface CreateTerminalDeviceInput {
  id: string;
  nodeId: NodeId;
  terminalType: TerminalDeviceType;
  designFlowRateLps: number;
  label?: string;
  markerSizeMeters?: number;
  referencePressureLossPa?: number;
  referencePressureLossSource?: "default" | "override";
}

export type TerminalDeviceComponent = EndpointComponent<
  "terminal",
  TerminalGeometry,
  TerminalMetadata
>;

export function createTerminalDevice(
  input: CreateTerminalDeviceInput
): TerminalDeviceComponent {
  assertNonEmptyId(input.id, "Terminal id");
  assertNonEmptyId(input.nodeId, "Terminal node id");
  assertPositiveNumber(input.designFlowRateLps, "Terminal designFlowRateLps");
  assertPositiveNumber(
    input.markerSizeMeters ?? 0.4,
    "Terminal markerSizeMeters"
  );
  assertPositiveNumber(
    input.referencePressureLossPa ??
      DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA[input.terminalType],
    "Terminal referencePressureLossPa"
  );

  return {
    id: input.id,
    type: "terminal",
    nodeIds: [input.nodeId],
    geometry: {
      markerSizeMeters: input.markerSizeMeters ?? 0.4
    },
    flow: createFlowData(input.designFlowRateLps, input.designFlowRateLps),
    pressureLossPa: null,
    metadata: {
      label: input.label ?? input.id,
      terminalType: input.terminalType,
      referencePressureLossPa:
        input.referencePressureLossPa ??
        DEFAULT_TERMINAL_REFERENCE_PRESSURE_LOSS_PA[input.terminalType],
      referencePressureLossSource:
        input.referencePressureLossSource ?? "default"
    }
  };
}
