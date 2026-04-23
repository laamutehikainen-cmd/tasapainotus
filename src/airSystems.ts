import type { TerminalDeviceType } from "./components";

export type AirSystemType =
  | "supply"
  | "extract"
  | "outdoor"
  | "exhaust"
  | "mixed";

export type AhuPortType = Exclude<AirSystemType, "mixed">;

export interface AhuPortSpec {
  portType: AhuPortType;
  label: string;
  shortLabel: string;
  color: string;
  localDirection: {
    x: number;
    y: number;
  };
}

export const AHU_PORT_SPECS: readonly AhuPortSpec[] = [
  {
    portType: "supply",
    label: "Supply",
    shortLabel: "S",
    color: "#2c819c",
    localDirection: { x: 1, y: 0 }
  },
  {
    portType: "extract",
    label: "Extract air",
    shortLabel: "E",
    color: "#2b8f55",
    localDirection: { x: 0, y: -1 }
  },
  {
    portType: "outdoor",
    label: "Outdoor air",
    shortLabel: "O",
    color: "#d4aa2a",
    localDirection: { x: -1, y: 0 }
  },
  {
    portType: "exhaust",
    label: "Exhaust",
    shortLabel: "X",
    color: "#8b5a2b",
    localDirection: { x: 0, y: 1 }
  }
] as const;

export function getAirSystemColor(airSystem: AirSystemType | null | undefined): string {
  switch (airSystem) {
    case "supply":
      return "#2c819c";
    case "extract":
      return "#2b8f55";
    case "outdoor":
      return "#d4aa2a";
    case "exhaust":
      return "#8b5a2b";
    case "mixed":
      return "#7f98a2";
    default:
      return "#2c819c";
  }
}

export function getAirSystemLabel(airSystem: AirSystemType | null | undefined): string {
  switch (airSystem) {
    case "supply":
      return "Supply";
    case "extract":
      return "Extract air";
    case "outdoor":
      return "Outdoor air";
    case "exhaust":
      return "Exhaust";
    case "mixed":
      return "Mixed";
    default:
      return "Unassigned";
  }
}

export function getAhuPortSpec(portType: AhuPortType): AhuPortSpec {
  const spec = AHU_PORT_SPECS.find((candidate) => candidate.portType === portType);

  if (!spec) {
    throw new Error(`Unsupported AHU port type "${portType}".`);
  }

  return spec;
}

export function mapTerminalTypeToAirSystem(
  terminalType: TerminalDeviceType
): AhuPortType {
  switch (terminalType) {
    case "supply":
      return "supply";
    case "exhaust":
      return "extract";
    case "outdoor":
      return "outdoor";
    case "exhaustAir":
      return "exhaust";
  }
}
