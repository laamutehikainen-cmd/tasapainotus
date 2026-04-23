import { createAhu, createDuctSegment, createTerminalDevice } from "../components";
import { createSampleDuctNetwork } from "../core/examples";
import { DuctNetworkGraph } from "../core/graph";
import { createNode } from "../core/nodes";
import { analyzeDuctRoutes } from "./routes";

describe("analyzeRouteBalancing", () => {
  it("compares parallel supply branches and suggests added resistance for lighter branches", () => {
    const analysis = analyzeDuctRoutes(createSampleDuctNetwork());

    expect(analysis.balancing.supply.branchGroups).toEqual([
      expect.objectContaining({
        nodeId: "node-main",
        nodeLabel: "Main branch junction",
        branchCount: 2,
        terminalCount: 2,
        requiresBalancing: false,
        imbalancePa: expect.closeTo(0.083737, 6),
        branches: [
          expect.objectContaining({
            branchNodeId: "node-room-b",
            branchLabel: "Room B diffuser",
            downstreamPressureLossPa: expect.closeTo(6.989828, 6),
            suggestedAdditionalLossPa: 0
          }),
          expect.objectContaining({
            branchNodeId: "node-room-a",
            branchLabel: "Room A diffuser",
            downstreamPressureLossPa: expect.closeTo(6.906091, 6),
            suggestedAdditionalLossPa: expect.closeTo(0.083737, 6)
          })
        ]
      })
    ]);
    expect(analysis.balancing.supply.maxPressureDifferencePa).toBeCloseTo(0.083737, 6);
    expect(analysis.balancing.exhaust.branchGroups).toHaveLength(0);
  });

  it("keeps equal branches within tolerance", () => {
    const analysis = analyzeDuctRoutes(createBalancedNetwork());

    expect(analysis.balancing.supply.branchGroups).toHaveLength(1);
    expect(analysis.balancing.supply.branchGroups[0]?.requiresBalancing).toBe(false);
    expect(analysis.balancing.supply.maxPressureDifferencePa).toBeCloseTo(0, 6);
  });

  it("balances supply and exhaust branches separately while ignoring intake and discharge paths", () => {
    const analysis = analyzeDuctRoutes(createCombinedSystemNetwork());

    expect(analysis.balancing.supply.branchGroups).toHaveLength(1);
    expect(analysis.balancing.exhaust.branchGroups).toHaveLength(1);
    expect(analysis.balancing.supply.branchGroups[0]?.terminalCount).toBe(2);
    expect(analysis.balancing.exhaust.branchGroups[0]?.terminalCount).toBe(2);
    expect(
      analysis.balancing.supply.branchGroups.some((group) =>
        group.branches.some((branch) => branch.terminalIds.includes("terminal-outdoor"))
      )
    ).toBe(false);
    expect(
      analysis.balancing.exhaust.branchGroups.some((group) =>
        group.branches.some((branch) => branch.terminalIds.includes("terminal-exhaust-air"))
      )
    ).toBe(false);
  });
});

function createBalancedNetwork(): DuctNetworkGraph {
  const graph = new DuctNetworkGraph();

  graph.addNode(
    createNode({
      id: "node-ahu",
      kind: "endpoint",
      position: { x: 0, y: 0, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-split",
      position: { x: 2, y: 0, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-left",
      kind: "endpoint",
      position: { x: 4, y: 1, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-right",
      kind: "endpoint",
      position: { x: 4, y: -1, z: 0 }
    })
  );

  graph.addComponent(
    createAhu({
      id: "ahu-1",
      nodeId: "node-ahu",
      label: "Balanced AHU"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-main",
      startNodeId: "node-ahu",
      endNodeId: "node-split",
      diameterMm: 315,
      lengthMeters: 2,
      label: "Balanced main"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-left",
      startNodeId: "node-split",
      endNodeId: "node-left",
      diameterMm: 250,
      lengthMeters: 2.2,
      label: "Left branch"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-right",
      startNodeId: "node-split",
      endNodeId: "node-right",
      diameterMm: 250,
      lengthMeters: 2.2,
      label: "Right branch"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-left",
      nodeId: "node-left",
      terminalType: "supply",
      designFlowRateLps: 150,
      label: "Left diffuser"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-right",
      nodeId: "node-right",
      terminalType: "supply",
      designFlowRateLps: 150,
      label: "Right diffuser"
    })
  );

  return graph;
}

function createCombinedSystemNetwork(): DuctNetworkGraph {
  const graph = new DuctNetworkGraph();

  graph.addNode(createNode({ id: "node-ahu", kind: "endpoint", position: { x: 0, y: 0, z: 0 } }));
  graph.addNode(createNode({ id: "node-supply-split", position: { x: 2, y: 1.5, z: 0 } }));
  graph.addNode(createNode({ id: "node-supply-a", kind: "endpoint", position: { x: 4.4, y: 2.6, z: 0 } }));
  graph.addNode(createNode({ id: "node-supply-b", kind: "endpoint", position: { x: 4.4, y: 0.6, z: 0 } }));
  graph.addNode(createNode({ id: "node-exhaust-split", position: { x: 2, y: -1.5, z: 0 } }));
  graph.addNode(createNode({ id: "node-exhaust-a", kind: "endpoint", position: { x: 4.5, y: -0.5, z: 0 } }));
  graph.addNode(createNode({ id: "node-exhaust-b", kind: "endpoint", position: { x: 4.5, y: -2.7, z: 0 } }));
  graph.addNode(createNode({ id: "node-outdoor", kind: "endpoint", position: { x: -2.5, y: 1.9, z: 0 } }));
  graph.addNode(createNode({ id: "node-exhaust-air", kind: "endpoint", position: { x: -2.5, y: -1.9, z: 0 } }));

  graph.addComponent(
    createAhu({
      id: "ahu-1",
      nodeId: "node-ahu",
      label: "Combined AHU",
      systemType: "mixed"
    })
  );
  graph.addComponent(createDuctSegment({ id: "duct-supply-main", startNodeId: "node-ahu", endNodeId: "node-supply-split", diameterMm: 355, lengthMeters: 2.3 }));
  graph.addComponent(createDuctSegment({ id: "duct-supply-a", startNodeId: "node-supply-split", endNodeId: "node-supply-a", diameterMm: 250, lengthMeters: 2.2 }));
  graph.addComponent(createDuctSegment({ id: "duct-supply-b", startNodeId: "node-supply-split", endNodeId: "node-supply-b", diameterMm: 250, lengthMeters: 2.6 }));
  graph.addComponent(createDuctSegment({ id: "duct-exhaust-main", startNodeId: "node-ahu", endNodeId: "node-exhaust-split", diameterMm: 355, lengthMeters: 2.5 }));
  graph.addComponent(createDuctSegment({ id: "duct-exhaust-a", startNodeId: "node-exhaust-split", endNodeId: "node-exhaust-a", diameterMm: 250, lengthMeters: 2.1 }));
  graph.addComponent(createDuctSegment({ id: "duct-exhaust-b", startNodeId: "node-exhaust-split", endNodeId: "node-exhaust-b", diameterMm: 250, lengthMeters: 2.7 }));
  graph.addComponent(createDuctSegment({ id: "duct-outdoor", startNodeId: "node-ahu", endNodeId: "node-outdoor", diameterMm: 315, lengthMeters: 2.2 }));
  graph.addComponent(createDuctSegment({ id: "duct-exhaust-air", startNodeId: "node-ahu", endNodeId: "node-exhaust-air", diameterMm: 315, lengthMeters: 2.2 }));

  graph.addComponent(createTerminalDevice({ id: "terminal-supply-a", nodeId: "node-supply-a", terminalType: "supply", designFlowRateLps: 140, label: "Supply A" }));
  graph.addComponent(createTerminalDevice({ id: "terminal-supply-b", nodeId: "node-supply-b", terminalType: "supply", designFlowRateLps: 140, label: "Supply B" }));
  graph.addComponent(createTerminalDevice({ id: "terminal-exhaust-a", nodeId: "node-exhaust-a", terminalType: "exhaust", designFlowRateLps: 125, label: "Exhaust A" }));
  graph.addComponent(createTerminalDevice({ id: "terminal-exhaust-b", nodeId: "node-exhaust-b", terminalType: "exhaust", designFlowRateLps: 125, label: "Exhaust B" }));
  graph.addComponent(createTerminalDevice({ id: "terminal-outdoor", nodeId: "node-outdoor", terminalType: "outdoor", designFlowRateLps: 280, label: "Outdoor air" }));
  graph.addComponent(createTerminalDevice({ id: "terminal-exhaust-air", nodeId: "node-exhaust-air", terminalType: "exhaustAir", designFlowRateLps: 250, label: "Exhaust air" }));

  return graph;
}
