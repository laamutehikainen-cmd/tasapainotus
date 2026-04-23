import { DuctNetworkGraph } from "../core/graph";
import type { NodeId } from "../core/nodes";
import type { TerminalDeviceType } from "../components";
import type { AutomaticFittingResult } from "./fittings";

export interface BalanceableRouteComponent {
  pressureLossPa: number;
}

export interface BalanceableRoute {
  terminalId: string;
  terminalLabel: string;
  terminalType: TerminalDeviceType;
  nodePath: NodeId[];
  totalPressureLossPa: number;
  componentBreakdown: BalanceableRouteComponent[];
  fittingBreakdown: AutomaticFittingResult[];
}

export interface BalancingOptions {
  balancingAbsoluteTolerancePa?: number;
  balancingRelativeTolerance?: number;
}

export interface BalancingBranchResult {
  branchNodeId: string;
  branchLabel: string;
  terminalIds: string[];
  terminalLabels: string[];
  representativeTerminalId: string;
  representativeTerminalLabel: string;
  downstreamPressureLossPa: number;
  suggestedAdditionalLossPa: number;
}

export interface BalancingBranchGroup {
  nodeId: string;
  nodeLabel: string;
  branchCount: number;
  terminalCount: number;
  imbalancePa: number;
  tolerancePa: number;
  requiresBalancing: boolean;
  referencePressureLossPa: number;
  branches: BalancingBranchResult[];
}

export interface BalancingSystemResult {
  terminalType: "supply" | "exhaust";
  branchGroups: BalancingBranchGroup[];
  requiresBalancing: boolean;
  maxPressureDifferencePa: number;
}

export interface BalancingAnalysisResult {
  supply: BalancingSystemResult;
  exhaust: BalancingSystemResult;
  requiresBalancing: boolean;
  maxPressureDifferencePa: number;
}

interface BranchContribution {
  route: BalanceableRoute;
  startNodeIndex: number;
}

const DEFAULT_BALANCING_ABSOLUTE_TOLERANCE_PA = 0.05;
const DEFAULT_BALANCING_RELATIVE_TOLERANCE = 0.02;

export function analyzeRouteBalancing(
  graph: DuctNetworkGraph,
  routes: BalanceableRoute[],
  options: BalancingOptions = {}
): BalancingAnalysisResult {
  const supply = analyzeBalancingSystem(graph, routes, "supply", options);
  const exhaust = analyzeBalancingSystem(graph, routes, "exhaust", options);

  return {
    supply,
    exhaust,
    requiresBalancing: supply.requiresBalancing || exhaust.requiresBalancing,
    maxPressureDifferencePa: Math.max(
      supply.maxPressureDifferencePa,
      exhaust.maxPressureDifferencePa
    )
  };
}

function analyzeBalancingSystem(
  graph: DuctNetworkGraph,
  routes: BalanceableRoute[],
  terminalType: "supply" | "exhaust",
  options: BalancingOptions
): BalancingSystemResult {
  const absoluteTolerancePa =
    options.balancingAbsoluteTolerancePa ??
    DEFAULT_BALANCING_ABSOLUTE_TOLERANCE_PA;
  const relativeTolerance =
    options.balancingRelativeTolerance ??
    DEFAULT_BALANCING_RELATIVE_TOLERANCE;
  const branchContributionsByNodeId = new Map<
    string,
    Map<string, BranchContribution[]>
  >();

  for (const route of routes.filter((candidate) => candidate.terminalType === terminalType)) {
    for (let nodeIndex = 0; nodeIndex < route.nodePath.length - 1; nodeIndex += 1) {
      const nodeId = route.nodePath[nodeIndex];
      const branchNodeId = route.nodePath[nodeIndex + 1];
      const branchContributions = getOrCreateBranchContributions(
        branchContributionsByNodeId,
        nodeId,
        branchNodeId
      );

      branchContributions.push({
        route,
        startNodeIndex: nodeIndex
      });
    }
  }

  const branchGroups = [...branchContributionsByNodeId.entries()]
    .map(([nodeId, branchContributionMap]) =>
      createBalancingBranchGroup(
        graph,
        nodeId,
        branchContributionMap,
        absoluteTolerancePa,
        relativeTolerance
      )
    )
    .filter((group): group is BalancingBranchGroup => group !== null)
    .sort((left, right) => right.imbalancePa - left.imbalancePa);

  return {
    terminalType,
    branchGroups,
    requiresBalancing: branchGroups.some((group) => group.requiresBalancing),
    maxPressureDifferencePa: branchGroups.reduce(
      (currentMax, group) => Math.max(currentMax, group.imbalancePa),
      0
    )
  };
}

function createBalancingBranchGroup(
  graph: DuctNetworkGraph,
  nodeId: string,
  branchContributionMap: Map<string, BranchContribution[]>,
  absoluteTolerancePa: number,
  relativeTolerance: number
): BalancingBranchGroup | null {
  if (branchContributionMap.size < 2) {
    return null;
  }

  const branches = [...branchContributionMap.entries()]
    .map(([branchNodeId, contributions]) =>
      createBalancingBranchResult(graph, branchNodeId, contributions)
    )
    .sort(
      (left, right) =>
        right.downstreamPressureLossPa - left.downstreamPressureLossPa
    );
  const referencePressureLossPa = Math.max(
    ...branches.map((branch) => branch.downstreamPressureLossPa)
  );
  const imbalancePa = Number(
    (
      referencePressureLossPa -
      Math.min(...branches.map((branch) => branch.downstreamPressureLossPa))
    ).toFixed(6)
  );
  const tolerancePa = Math.max(
    absoluteTolerancePa,
    referencePressureLossPa * relativeTolerance
  );
  const node = graph.getNode(nodeId);

  return {
    nodeId,
    nodeLabel: node.metadata.label ?? node.id,
    branchCount: branches.length,
    terminalCount: branches.reduce(
      (sum, branch) => sum + branch.terminalIds.length,
      0
    ),
    imbalancePa,
    tolerancePa,
    requiresBalancing: imbalancePa > tolerancePa,
    referencePressureLossPa,
    branches: branches.map((branch) => ({
      ...branch,
      suggestedAdditionalLossPa: Number(
        (referencePressureLossPa - branch.downstreamPressureLossPa).toFixed(6)
      )
    }))
  };
}

function createBalancingBranchResult(
  graph: DuctNetworkGraph,
  branchNodeId: string,
  contributions: BranchContribution[]
): BalancingBranchResult {
  const representativeContribution = contributions.reduce(
    (currentWorst, candidate) => {
      const candidateLoss = calculateDownstreamPressureLoss(
        candidate.route,
        candidate.startNodeIndex
      );

      if (!currentWorst) {
        return {
          contribution: candidate,
          lossPa: candidateLoss
        };
      }

      return candidateLoss > currentWorst.lossPa
        ? {
            contribution: candidate,
            lossPa: candidateLoss
          }
        : currentWorst;
    },
    null as
      | {
          contribution: BranchContribution;
          lossPa: number;
        }
      | null
  );

  if (!representativeContribution) {
    throw new Error(`Branch "${branchNodeId}" has no route contributions.`);
  }

  const branchNode = graph.getNode(branchNodeId);
  const terminalIds = [...new Set(contributions.map((item) => item.route.terminalId))];
  const terminalLabels = [
    ...new Set(contributions.map((item) => item.route.terminalLabel))
  ];

  return {
    branchNodeId,
    branchLabel:
      terminalLabels.length === 1
        ? terminalLabels[0]
        : `${branchNode.metadata.label ?? branchNode.id} subtree`,
    terminalIds,
    terminalLabels,
    representativeTerminalId: representativeContribution.contribution.route.terminalId,
    representativeTerminalLabel:
      representativeContribution.contribution.route.terminalLabel,
    downstreamPressureLossPa: representativeContribution.lossPa,
    suggestedAdditionalLossPa: 0
  };
}

function calculateDownstreamPressureLoss(
  route: BalanceableRoute,
  startNodeIndex: number
): number {
  const downstreamComponentLossPa = route.componentBreakdown
    .slice(startNodeIndex + 1)
    .reduce((sum, component) => sum + component.pressureLossPa, 0);
  const downstreamFittingLossPa = route.fittingBreakdown
    .filter((fitting) => fitting.nodeIndex >= startNodeIndex)
    .reduce((sum, fitting) => sum + fitting.pressureLossPa, 0);

  return downstreamComponentLossPa + downstreamFittingLossPa;
}

function getOrCreateBranchContributions(
  branchContributionsByNodeId: Map<string, Map<string, BranchContribution[]>>,
  nodeId: string,
  branchNodeId: string
): BranchContribution[] {
  let branchContributionMap = branchContributionsByNodeId.get(nodeId);

  if (!branchContributionMap) {
    branchContributionMap = new Map<string, BranchContribution[]>();
    branchContributionsByNodeId.set(nodeId, branchContributionMap);
  }

  let branchContributions = branchContributionMap.get(branchNodeId);

  if (!branchContributions) {
    branchContributions = [];
    branchContributionMap.set(branchNodeId, branchContributions);
  }

  return branchContributions;
}
