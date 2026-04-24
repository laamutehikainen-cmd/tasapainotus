import type { DuctSegmentComponent, NetworkComponent } from "../components";
import { DuctNetworkGraph } from "../core/graph";
import { DEFAULT_AIR_PROPERTIES, calculateAirVelocity, millimetersToMeters, type AirProperties } from "./air";
import { calculateDarcyWeisbachPressureLoss } from "./darcyWeisbach";
import { propagateTerminalFlows, type FlowPropagationResult } from "./flowPropagation";
import { calculateHydraulicDiameter } from "./hydraulicDiameter";
import { calculateLocalPressureLoss } from "./localLoss";
import { calculateReynoldsNumber } from "./reynolds";
import { calculateSwameeJainFrictionFactor } from "./swameeJain";

export interface ComponentPerformanceResult {
  componentId: string;
  componentType: NetworkComponent["type"];
  flowRateLps: number;
  velocityMps: number | null;
  reynoldsNumber: number | null;
  hydraulicDiameterMeters: number | null;
  frictionFactor: number | null;
  frictionPressureLossPa: number;
  localPressureLossPa: number;
  totalPressureLossPa: number;
}

export interface NetworkPerformanceAnalysis {
  airProperties: AirProperties;
  systemFlowRateLps: number;
  flowPropagation: FlowPropagationResult;
  componentResults: ComponentPerformanceResult[];
}

export interface NetworkPerformanceOptions {
  airProperties?: Partial<AirProperties>;
}

export function analyzeDuctNetworkPerformance(
  graph: DuctNetworkGraph,
  options: NetworkPerformanceOptions = {}
): NetworkPerformanceAnalysis {
  const airProperties: AirProperties = {
    ...DEFAULT_AIR_PROPERTIES,
    ...(options.airProperties ?? {})
  };
  const flowPropagation = propagateTerminalFlows(graph);
  const componentResults = graph.getComponents().map((component) =>
    createComponentPerformanceResult(
      component,
      flowPropagation,
      airProperties
    )
  );

  return {
    airProperties,
    systemFlowRateLps: flowPropagation.systemFlowRateLps,
    flowPropagation,
    componentResults
  };
}

export function getComponentPerformanceResult(
  analysis: NetworkPerformanceAnalysis,
  componentId: string
): ComponentPerformanceResult {
  const result = analysis.componentResults.find(
    (componentResult) => componentResult.componentId === componentId
  );

  if (!result) {
    throw new Error(`Unknown component result "${componentId}".`);
  }

  return result;
}

function createComponentPerformanceResult(
  component: NetworkComponent,
  flowPropagation: FlowPropagationResult,
  airProperties: AirProperties
): ComponentPerformanceResult {
  if (component.type === "ahu") {
    return {
      componentId: component.id,
      componentType: component.type,
      flowRateLps: flowPropagation.systemFlowRateLps,
      velocityMps: null,
      reynoldsNumber: null,
      hydraulicDiameterMeters: null,
      frictionFactor: null,
      frictionPressureLossPa: 0,
      localPressureLossPa: component.metadata.devicePressureLossPa,
      totalPressureLossPa: component.metadata.devicePressureLossPa
    };
  }

  if (component.type === "terminal") {
    return {
      componentId: component.id,
      componentType: component.type,
      flowRateLps: component.flow.designFlowRateLps ?? 0,
      velocityMps: null,
      reynoldsNumber: null,
      hydraulicDiameterMeters: null,
      frictionFactor: null,
      frictionPressureLossPa: 0,
      localPressureLossPa: component.metadata.referencePressureLossPa,
      totalPressureLossPa: component.metadata.referencePressureLossPa
    };
  }

  return analyzeDuctSegmentPerformance(
    component,
    flowPropagation.componentFlowRateLpsById[component.id] ?? 0,
    airProperties
  );
}

function analyzeDuctSegmentPerformance(
  component: DuctSegmentComponent,
  flowRateLps: number,
  airProperties: AirProperties
): ComponentPerformanceResult {
  const diameterMeters = millimetersToMeters(component.geometry.diameterMm);
  const hydraulicDiameterMeters = calculateHydraulicDiameter({
    shape: "round",
    diameterMeters
  });
  const velocityMps = calculateAirVelocity(flowRateLps, diameterMeters);
  const reynoldsNumber = calculateReynoldsNumber({
    densityKgPerM3: airProperties.densityKgPerM3,
    velocityMps,
    hydraulicDiameterMeters,
    dynamicViscosityPaS: airProperties.dynamicViscosityPaS
  });
  const frictionFactor = calculateSwameeJainFrictionFactor({
    reynoldsNumber,
    roughnessMeters: component.metadata.roughnessMm / 1000,
    hydraulicDiameterMeters
  });
  const frictionPressureLossPa = calculateDarcyWeisbachPressureLoss({
    frictionFactor,
    lengthMeters: component.geometry.lengthMeters,
    hydraulicDiameterMeters,
    densityKgPerM3: airProperties.densityKgPerM3,
    velocityMps
  });
  const localPressureLossPa = calculateLocalPressureLoss({
    lossCoefficient: component.metadata.localLossCoefficient,
    densityKgPerM3: airProperties.densityKgPerM3,
    velocityMps
  });

  return {
    componentId: component.id,
    componentType: component.type,
    flowRateLps,
    velocityMps,
    reynoldsNumber,
    hydraulicDiameterMeters,
    frictionFactor,
    frictionPressureLossPa,
    localPressureLossPa,
    totalPressureLossPa: frictionPressureLossPa + localPressureLossPa
  };
}
