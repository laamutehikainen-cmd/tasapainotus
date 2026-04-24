import { createAhu, createDuctSegment, createTerminalDevice } from "../components";
import { createSampleDuctNetwork } from "../core/examples";
import { DuctNetworkGraph } from "../core/graph";
import { createNode } from "../core/nodes";
import {
  analyzeDuctRoutes,
  createAutomaticFittingOverrideKey
} from "./index";

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
        totalComponentPressureLossPa: expect.closeTo(182.52384842963098, 10),
        totalFittingPressureLossPa: expect.closeTo(4.980138818388187, 10),
        totalPressureLossPa: expect.closeTo(187.50398724801917, 10)
      }),
      expect.objectContaining({
        terminalId: "terminal-room-b",
        terminalLabel: "Room B diffuser",
        terminalType: "supply",
        nodePath: ["node-ahu", "node-main", "node-room-b"],
        componentIds: ["ahu-1", "duct-main", "duct-branch-b", "terminal-room-b"],
        totalComponentPressureLossPa: expect.closeTo(182.6075854652342, 10),
        totalFittingPressureLossPa: expect.closeTo(4.980138818388187, 10),
        totalPressureLossPa: expect.closeTo(187.58772428362238, 10)
      })
    ]);

    expect(analysis.criticalPath).toEqual(
      expect.objectContaining({
        terminalId: "terminal-room-b",
        totalPressureLossPa: expect.closeTo(187.58772428362238, 10)
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
        pressureLossPa: 150
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
        pressureLossPa: 30
      })
    ]);

    expect(route.fittingBreakdown).toEqual([
      expect.objectContaining({
        fittingType: "tee",
        nodeId: "node-main",
        downstreamComponentId: "duct-branch-a",
        lossCoefficient: 0.5,
        pressureLossPa: expect.closeTo(4.980138818388187, 10)
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
    expect(analysis.systems.fanPressure.supplyFanPressurePa).toBeCloseTo(205.549688, 6);
    expect(analysis.systems.fanPressure.exhaustFanPressurePa).toBeCloseTo(224.210511, 6);
  });

  it("adds AHU and terminal pressure losses to route totals and fan pressure", () => {
    const analysis = analyzeDuctRoutes(createCustomComponentLossNetwork());
    const supplyRoute = analysis.systems.supply.criticalPath;
    const outdoorRoute = analysis.systems.outdoor.criticalPath;

    expect(supplyRoute).not.toBeNull();
    expect(outdoorRoute).not.toBeNull();
    expect(supplyRoute?.componentBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "ahu-1",
          pressureLossPa: 180
        }),
        expect.objectContaining({
          componentId: "terminal-supply",
          pressureLossPa: 55
        })
      ])
    );
    expect(outdoorRoute?.componentBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "terminal-outdoor",
          pressureLossPa: 25
        })
      ])
    );
    expect(supplyRoute?.totalPressureLossPa).toBeGreaterThan(235);
    expect(analysis.systems.fanPressure.supplyFanPressurePa).toBeCloseTo(
      supplyRoute!.totalPressureLossPa + outdoorRoute!.totalPressureLossPa - 180,
      6
    );
  });

  it("adds an automatic elbow loss on a turning route with two connected ducts", () => {
    const analysis = analyzeDuctRoutes(createElbowNetwork());
    const route = analysis.routes[0];

    expect(route.fittingBreakdown).toEqual([
      expect.objectContaining({
        fittingType: "elbow",
        nodeId: "node-turn",
        downstreamComponentId: "duct-outlet",
        lossCoefficient: 0.5
      })
    ]);
    expect(route.totalFittingPressureLossPa).toBeGreaterThan(0);
    expect(route.totalPressureLossPa).toBeGreaterThan(route.totalComponentPressureLossPa);
  });

  it("applies manual zeta overrides to automatic fittings", () => {
    const baselineAnalysis = analyzeDuctRoutes(createSampleDuctNetwork());
    const overriddenAnalysis = analyzeDuctRoutes(createSampleDuctNetwork(), {
      automaticFittingOverrides: [
        {
          key: createAutomaticFittingOverrideKey(
            "node-main",
            "tee",
            "duct-branch-a"
          ),
          nodeId: "node-main",
          fittingType: "tee",
          downstreamComponentId: "duct-branch-a",
          lossCoefficient: 1.2
        }
      ]
    });

    const baselineRoute = baselineAnalysis.routes.find(
      (route) => route.terminalId === "terminal-room-a"
    );
    const overriddenRoute = overriddenAnalysis.routes.find(
      (route) => route.terminalId === "terminal-room-a"
    );

    expect(baselineRoute).toBeDefined();
    expect(overriddenRoute).toBeDefined();
    expect(overriddenRoute!.totalPressureLossPa).toBeGreaterThan(
      baselineRoute!.totalPressureLossPa
    );
    expect(overriddenRoute!.fittingBreakdown[0]?.manualOverrideApplied).toBe(true);
    expect(overriddenRoute!.fittingBreakdown[0]?.lossCoefficient).toBe(1.2);
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

function createElbowNetwork(): DuctNetworkGraph {
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
      id: "node-turn",
      position: { x: 2, y: 0, z: 0 }
    })
  );
  graph.addNode(
    createNode({
      id: "node-terminal",
      kind: "endpoint",
      position: { x: 2, y: 2, z: 0 }
    })
  );

  graph.addComponent(
    createAhu({
      id: "ahu-1",
      nodeId: "node-ahu"
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-inlet",
      startNodeId: "node-ahu",
      endNodeId: "node-turn",
      diameterMm: 250,
      lengthMeters: 2
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-outlet",
      startNodeId: "node-turn",
      endNodeId: "node-terminal",
      diameterMm: 250,
      lengthMeters: 2
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-1",
      nodeId: "node-terminal",
      terminalType: "supply",
      designFlowRateLps: 150
    })
  );

  return graph;
}

function createCustomComponentLossNetwork(): DuctNetworkGraph {
  const graph = new DuctNetworkGraph();

  graph.addNode(createNode({ id: "node-ahu", kind: "endpoint", position: { x: 0, y: 0, z: 0 } }));
  graph.addNode(createNode({ id: "node-supply", kind: "endpoint", position: { x: 2, y: 0, z: 0 } }));
  graph.addNode(createNode({ id: "node-outdoor", kind: "endpoint", position: { x: -2, y: 0, z: 0 } }));

  graph.addComponent(
    createAhu({
      id: "ahu-1",
      nodeId: "node-ahu",
      devicePressureLossPa: 180
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-supply",
      startNodeId: "node-ahu",
      endNodeId: "node-supply",
      diameterMm: 250,
      lengthMeters: 2
    })
  );
  graph.addComponent(
    createDuctSegment({
      id: "duct-outdoor",
      startNodeId: "node-ahu",
      endNodeId: "node-outdoor",
      diameterMm: 250,
      lengthMeters: 2
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-supply",
      nodeId: "node-supply",
      terminalType: "supply",
      designFlowRateLps: 180,
      referencePressureLossPa: 55,
      referencePressureLossSource: "override"
    })
  );
  graph.addComponent(
    createTerminalDevice({
      id: "terminal-outdoor",
      nodeId: "node-outdoor",
      terminalType: "outdoor",
      designFlowRateLps: 180,
      referencePressureLossPa: 25,
      referencePressureLossSource: "override"
    })
  );

  return graph;
}
