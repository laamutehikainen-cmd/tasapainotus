import { createAhu, createDuctSegment, createTerminalDevice } from "../components";
import { createSampleDuctNetwork } from "../core/examples";
import { DuctNetworkGraph } from "../core/graph";
import { createNode } from "../core/nodes";
import { analyzeDuctRoutes } from "./routes";

describe("analyzeDuctRoutes", () => {
  it("returns a route breakdown for each terminal and identifies the critical path", () => {
    const analysis = analyzeDuctRoutes(createSampleDuctNetwork());

    expect(analysis.routes).toHaveLength(2);

    expect(analysis.routes).toEqual([
      expect.objectContaining({
        terminalId: "terminal-room-a",
        terminalLabel: "Room A diffuser",
        terminalType: "supply",
        nodePath: ["node-ahu", "node-main", "node-room-a"],
        componentIds: ["ahu-1", "duct-main", "duct-branch-a", "terminal-room-a"],
        totalPressureLossPa: expect.closeTo(2.5238484296309914, 10)
      }),
      expect.objectContaining({
        terminalId: "terminal-room-b",
        terminalLabel: "Room B diffuser",
        terminalType: "supply",
        nodePath: ["node-ahu", "node-main", "node-room-b"],
        componentIds: ["ahu-1", "duct-main", "duct-branch-b", "terminal-room-b"],
        totalPressureLossPa: expect.closeTo(2.607585465234198, 10)
      })
    ]);

    expect(analysis.criticalPath).toEqual(
      expect.objectContaining({
        terminalId: "terminal-room-b",
        totalPressureLossPa: expect.closeTo(2.607585465234198, 10)
      })
    );
    expect(analysis.networkPerformance.systemFlowRateLps).toBe(400);
    expect(analysis.systems.supply.totalFlowRateLps).toBe(400);
    expect(analysis.systems.exhaust.totalFlowRateLps).toBe(0);
    expect(analysis.balancing.supply.branchGroups).toHaveLength(1);
  });

  it("keeps component-level pressure loss values in the route breakdown", () => {
    const analysis = analyzeDuctRoutes(createSampleDuctNetwork());
    const route = analysis.routes[0];

    expect(route.componentBreakdown).toEqual([
      expect.objectContaining({
        componentId: "ahu-1",
        componentType: "ahu",
        pressureLossPa: 0
      }),
      expect.objectContaining({
        componentId: "duct-main",
        componentType: "ductSegment",
        pressureLossPa: expect.closeTo(0.5978966107572442, 10)
      }),
      expect.objectContaining({
        componentId: "duct-branch-a",
        componentType: "ductSegment",
        pressureLossPa: expect.closeTo(1.9259518188737474, 10)
      }),
      expect.objectContaining({
        componentId: "terminal-room-a",
        componentType: "terminal",
        pressureLossPa: 0
      })
    ]);
  });

  it("builds separate supply and exhaust fan pressure summaries", () => {
    const analysis = analyzeDuctRoutes(createAirHandlingLoopNetwork());

    expect(analysis.systems.supply.totalFlowRateLps).toBe(200);
    expect(analysis.systems.exhaust.totalFlowRateLps).toBe(160);
    expect(analysis.systems.outdoor.totalFlowRateLps).toBe(200);
    expect(analysis.systems.exhaustAir.totalFlowRateLps).toBe(160);
    expect(analysis.systems.supply.criticalPath?.terminalId).toBe("terminal-supply-room");
    expect(analysis.systems.exhaust.criticalPath?.terminalId).toBe("terminal-exhaust-room");
    expect(analysis.systems.outdoor.criticalPath?.terminalId).toBe("terminal-outdoor");
    expect(analysis.systems.exhaustAir.criticalPath?.terminalId).toBe("terminal-exhaust-air");
    expect(analysis.systems.fanPressure.supplyFanPressurePa).toBeCloseTo(5.549688, 6);
    expect(analysis.systems.fanPressure.exhaustFanPressurePa).toBeCloseTo(4.210511, 6);
  });
});

function createAirHandlingLoopNetwork(): DuctNetworkGraph {
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
      id: "node-supply",
      position: { x: 2.8, y: 1.2, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-outdoor",
      kind: "endpoint",
      position: { x: -2.4, y: 1.8, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-exhaust",
      position: { x: 2.7, y: -1.5, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-exhaust-air",
      kind: "endpoint",
      position: { x: -2.6, y: -1.9, z: 0 }
    })
  );

  graph.addComponent(
    createAhu({
      id: "ahu-1",
      nodeId: "node-ahu",
      label: "Mixed AHU",
      systemType: "mixed"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-supply-main",
      startNodeId: "node-ahu",
      endNodeId: "node-supply",
      diameterMm: 315,
      lengthMeters: 3.1,
      localLossCoefficient: 0.6,
      label: "Supply main"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-outdoor-main",
      startNodeId: "node-ahu",
      endNodeId: "node-outdoor",
      diameterMm: 315,
      lengthMeters: 2.8,
      localLossCoefficient: 0.4,
      label: "Outdoor air main"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-exhaust-main",
      startNodeId: "node-ahu",
      endNodeId: "node-exhaust",
      diameterMm: 315,
      lengthMeters: 3.4,
      localLossCoefficient: 0.8,
      label: "Exhaust main"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-exhaust-air-main",
      startNodeId: "node-ahu",
      endNodeId: "node-exhaust-air",
      diameterMm: 315,
      lengthMeters: 3.1,
      localLossCoefficient: 0.4,
      label: "Exhaust air main"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-supply-room",
      nodeId: "node-supply",
      terminalType: "supply",
      designFlowRateLps: 200,
      label: "Supply room"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-outdoor",
      nodeId: "node-outdoor",
      terminalType: "outdoor",
      designFlowRateLps: 200,
      label: "Outdoor air"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-exhaust-room",
      nodeId: "node-exhaust",
      terminalType: "exhaust",
      designFlowRateLps: 160,
      label: "Exhaust room"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-exhaust-air",
      nodeId: "node-exhaust-air",
      terminalType: "exhaustAir",
      designFlowRateLps: 160,
      label: "Exhaust air"
    })
  );

  return graph;
}
