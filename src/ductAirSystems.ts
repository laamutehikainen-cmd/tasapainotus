import type { RouteAnalysisResult } from "./calc";
import type { NetworkComponent } from "./components";
import type { EditorDocument } from "./ui/editorState";
import {
  getAirSystemLabel,
  mapTerminalTypeToAirSystem,
  type AirSystemType
} from "./airSystems";

export function deriveDuctAirSystemLookup(
  document: EditorDocument,
  analysis: RouteAnalysisResult | null
): Record<string, AirSystemType> {
  const airSystemsByComponentId = new Map<string, AirSystemType>();

  for (const component of document.components) {
    if (
      component.type === "ductSegment" &&
      component.metadata.ahuConnection
    ) {
      airSystemsByComponentId.set(
        component.id,
        component.metadata.ahuConnection.portType
      );
    }
  }

  if (analysis) {
    for (const route of analysis.routes) {
      const airSystem = mapTerminalTypeToAirSystem(route.terminalType);

      for (const item of route.componentBreakdown) {
        if (item.componentType !== "ductSegment") {
          continue;
        }

        assignAirSystem(airSystemsByComponentId, item.componentId, airSystem);
      }
    }
  }

  return Object.fromEntries(airSystemsByComponentId.entries());
}

export function describeDuctConnection(
  component: Extract<NetworkComponent, { type: "ductSegment" }>,
  airSystem: AirSystemType | null | undefined
): string {
  if (component.metadata.ahuConnection) {
    return `AHU ${getAirSystemLabel(component.metadata.ahuConnection.portType)} port`;
  }

  return getAirSystemLabel(airSystem);
}

function assignAirSystem(
  airSystemsByComponentId: Map<string, AirSystemType>,
  componentId: string,
  nextAirSystem: AirSystemType
): void {
  const previousAirSystem = airSystemsByComponentId.get(componentId);

  if (!previousAirSystem || previousAirSystem === nextAirSystem) {
    airSystemsByComponentId.set(componentId, nextAirSystem);

    return;
  }

  airSystemsByComponentId.set(componentId, "mixed");
}
