import type {
  NetworkComponent,
  TerminalDeviceComponent,
  TerminalDeviceType
} from "../components";
import { DuctNetworkGraph, type TerminalPath } from "../core/graph";
import {
  analyzeDuctNetworkPerformance,
  getComponentPerformanceResult,
  type ComponentPerformanceResult,
  type NetworkPerformanceAnalysis,
  type NetworkPerformanceOptions
} from "./networkPerformance";
import {
  analyzeRouteBalancing,
  type BalancingAnalysisResult,
  type BalancingOptions
} from "./balancing";
import {
  analyzeAutomaticRouteFittings,
  type AutomaticFittingOverride,
  createNodePairKey,
  type AutomaticFittingResult
} from "./fittings";

export interface RouteComponentBreakdownItem {
  componentId: string;
  componentType: NetworkComponent["type"];
  pressureLossPa: number;
  result: ComponentPerformanceResult;
}

export interface TerminalRouteResult {
  terminalId: string;
  terminalLabel: string;
  terminalType: TerminalDeviceType;
  designFlowRateLps: number;
  nodePath: string[];
  componentIds: string[];
  componentBreakdown: RouteComponentBreakdownItem[];
  fittingBreakdown: AutomaticFittingResult[];
  totalComponentPressureLossPa: number;
  totalFittingPressureLossPa: number;
  totalPressureLossPa: number;
}

export interface RouteSystemSummary {
  terminalType: TerminalDeviceType;
  routes: TerminalRouteResult[];
  criticalPath: TerminalRouteResult | null;
  totalFlowRateLps: number;
}

export interface FanPressureSummary {
  supplyFanPressurePa: number | null;
  exhaustFanPressurePa: number | null;
}

export interface RouteSystemsSummary {
  supply: RouteSystemSummary;
  exhaust: RouteSystemSummary;
  outdoor: RouteSystemSummary;
  exhaustAir: RouteSystemSummary;
  fanPressure: FanPressureSummary;
}

export interface RouteAnalysisResult {
  networkPerformance: NetworkPerformanceAnalysis;
  routes: TerminalRouteResult[];
  criticalPath: TerminalRouteResult | null;
  automaticFittings: AutomaticFittingResult[];
  systems: RouteSystemsSummary;
  balancing: BalancingAnalysisResult;
}

export function analyzeDuctRoutes(
  graph: DuctNetworkGraph,
  options: NetworkPerformanceOptions &
    BalancingOptions & {
      automaticFittingOverrides?: AutomaticFittingOverride[];
    } = {}
): RouteAnalysisResult {
  const ahu = graph.getAhu();

  if (!ahu) {
    throw new Error("Cannot analyze routes without an AHU.");
  }

  const networkPerformance = analyzeDuctNetworkPerformance(graph, options);
  const terminalById = new Map(
    graph.getTerminals().map((terminal) => [terminal.id, terminal])
  );
  const routeComponentIdLookup = createRouteComponentIdLookup(graph);
  const routes = graph.getTerminalPathsFromAhu().map((terminalPath) =>
    createTerminalRouteResult(
      graph,
      terminalPath,
      ahu.id,
      terminalById,
      routeComponentIdLookup,
      networkPerformance,
      options.automaticFittingOverrides ?? []
    )
  );
  const criticalPath = findCriticalPath(routes);
  const systems = createRouteSystemsSummary(routes);
  const automaticFittings = createUniqueAutomaticFittings(routes);

  return {
    networkPerformance,
    routes,
    criticalPath,
    automaticFittings,
    systems,
    balancing: analyzeRouteBalancing(graph, routes, options)
  };
}

function createTerminalRouteResult(
  graph: DuctNetworkGraph,
  terminalPath: TerminalPath,
  ahuId: string,
  terminalById: Map<string, TerminalDeviceComponent>,
  routeComponentIdLookup: Map<string, string>,
  networkPerformance: NetworkPerformanceAnalysis,
  automaticFittingOverrides: AutomaticFittingOverride[]
): TerminalRouteResult {
  const terminal = terminalById.get(terminalPath.terminalId);

  if (!terminal) {
    throw new Error(`Unknown terminal "${terminalPath.terminalId}" in route.`);
  }

  const inlineComponentIds = deriveInlineComponentIdsForPath(
    terminalPath.nodePath,
    routeComponentIdLookup
  );
  const componentIds = [ahuId, ...inlineComponentIds, terminal.id];
  const componentBreakdown = componentIds.map((componentId) => {
    const result = getComponentPerformanceResult(networkPerformance, componentId);

    return {
      componentId,
      componentType: result.componentType,
      pressureLossPa: result.totalPressureLossPa,
      result
    };
  });
  const fittingBreakdown = analyzeAutomaticRouteFittings(
    graph,
    terminalPath.nodePath,
    routeComponentIdLookup,
    networkPerformance,
    automaticFittingOverrides
  );
  const totalComponentPressureLossPa = componentBreakdown.reduce(
    (sum, item) => sum + item.pressureLossPa,
    0
  );
  const totalFittingPressureLossPa = fittingBreakdown.reduce(
    (sum, fitting) => sum + fitting.pressureLossPa,
    0
  );

  return {
    terminalId: terminal.id,
    terminalLabel: terminal.metadata.label,
    terminalType: terminal.metadata.terminalType,
    designFlowRateLps: terminal.flow.designFlowRateLps ?? 0,
    nodePath: terminalPath.nodePath,
    componentIds,
    componentBreakdown,
    fittingBreakdown,
    totalComponentPressureLossPa,
    totalFittingPressureLossPa,
    totalPressureLossPa: totalComponentPressureLossPa + totalFittingPressureLossPa
  };
}

function createUniqueAutomaticFittings(
  routes: TerminalRouteResult[]
): AutomaticFittingResult[] {
  const fittingById = new Map<string, AutomaticFittingResult>();

  for (const route of routes) {
    for (const fitting of route.fittingBreakdown) {
      fittingById.set(fitting.id, fitting);
    }
  }

  return [...fittingById.values()];
}

function createRouteSystemsSummary(routes: TerminalRouteResult[]): RouteSystemsSummary {
  const supply = createRouteSystemSummary("supply", routes);
  const exhaust = createRouteSystemSummary("exhaust", routes);
  const outdoor = createRouteSystemSummary("outdoor", routes);
  const exhaustAir = createRouteSystemSummary("exhaustAir", routes);

  return {
    supply,
    exhaust,
    outdoor,
    exhaustAir,
    fanPressure: {
      supplyFanPressurePa: sumRoutePressureLossPa(
        supply.criticalPath,
        outdoor.criticalPath,
        "ahu"
      ),
      exhaustFanPressurePa: sumRoutePressureLossPa(
        exhaust.criticalPath,
        exhaustAir.criticalPath,
        "ahu"
      )
    }
  };
}

function createRouteSystemSummary(
  terminalType: TerminalDeviceType,
  routes: TerminalRouteResult[]
): RouteSystemSummary {
  const filteredRoutes = routes.filter((route) => route.terminalType === terminalType);

  return {
    terminalType,
    routes: filteredRoutes,
    criticalPath: findCriticalPath(filteredRoutes),
    totalFlowRateLps: filteredRoutes.reduce(
      (sum, route) => sum + route.designFlowRateLps,
      0
    )
  };
}

function findCriticalPath(
  routes: TerminalRouteResult[]
): TerminalRouteResult | null {
  return (
    routes.reduce<TerminalRouteResult | null>((currentWorst, candidate) => {
      if (!currentWorst) {
        return candidate;
      }

      return candidate.totalPressureLossPa > currentWorst.totalPressureLossPa
        ? candidate
        : currentWorst;
    }, null) ?? null
  );
}

function sumRoutePressureLossPa(
  primaryRoute: TerminalRouteResult | null,
  secondaryRoute: TerminalRouteResult | null,
  sharedComponentType: NetworkComponent["type"] | null = null
): number | null {
  if (!primaryRoute && !secondaryRoute) {
    return null;
  }

  const sharedPressureLossPa =
    primaryRoute && secondaryRoute && sharedComponentType
      ? findSharedComponentPressureLossPa(
          primaryRoute,
          secondaryRoute,
          sharedComponentType
        )
      : 0;

  return Number(
    (
      (primaryRoute?.totalPressureLossPa ?? 0) +
      (secondaryRoute?.totalPressureLossPa ?? 0) -
      sharedPressureLossPa
    ).toFixed(6)
  );
}

function findSharedComponentPressureLossPa(
  primaryRoute: TerminalRouteResult,
  secondaryRoute: TerminalRouteResult,
  componentType: NetworkComponent["type"]
): number {
  const secondaryComponentIds = new Set(secondaryRoute.componentIds);
  const sharedComponent = primaryRoute.componentBreakdown.find(
    (item) =>
      item.componentType === componentType &&
      secondaryComponentIds.has(item.componentId)
  );

  return sharedComponent?.pressureLossPa ?? 0;
}

function deriveInlineComponentIdsForPath(
  nodePath: string[],
  routeComponentIdLookup: Map<string, string>
): string[] {
  const componentIds: string[] = [];

  for (let index = 0; index < nodePath.length - 1; index += 1) {
    const fromNodeId = nodePath[index];
    const toNodeId = nodePath[index + 1];
    const key = createNodePairKey(fromNodeId, toNodeId);
    const componentId = routeComponentIdLookup.get(key);

    if (!componentId) {
      throw new Error(
        `No inline component found between nodes "${fromNodeId}" and "${toNodeId}".`
      );
    }

    componentIds.push(componentId);
  }

  return componentIds;
}

function createRouteComponentIdLookup(graph: DuctNetworkGraph): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const edge of graph.getEdges()) {
    lookup.set(
      createNodePairKey(edge.fromNodeId, edge.toNodeId),
      edge.componentId
    );
  }

  return lookup;
}
