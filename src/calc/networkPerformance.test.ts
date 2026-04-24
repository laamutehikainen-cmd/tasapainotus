import { createAhu, createDuctSegment, createTerminalDevice } from "../components";
import { createSampleDuctNetwork } from "../core/examples";
import { DuctNetworkGraph } from "../core/graph";
import { createNode } from "../core/nodes";
import {
  analyzeDuctNetworkPerformance,
  getComponentPerformanceResult
} from "./networkPerformance";

describe("analyzeDuctNetworkPerformance", () => {
  it("returns pressure loss, velocity, and Reynolds values for duct components", () => {
    const analysis = analyzeDuctNetworkPerformance(createSampleDuctNetwork());

    expect(analysis.systemFlowRateLps).toBe(400);

    const mainDuct = getComponentPerformanceResult(analysis, "duct-main");
    const branchA = getComponentPerformanceResult(analysis, "duct-branch-a");
    const ahu = getComponentPerformanceResult(analysis, "ahu-1");
    const terminal = getComponentPerformanceResult(analysis, "terminal-room-a");

    expect(mainDuct.flowRateLps).toBe(400);
    expect(mainDuct.velocityMps).toBeCloseTo(3.183099, 6);
    expect(mainDuct.reynoldsNumber).toBeCloseTo(84413.671474, 6);
    expect(mainDuct.frictionFactor).toBeCloseTo(0.01967, 6);
    expect(mainDuct.totalPressureLossPa).toBeCloseTo(0.597897, 6);

    expect(branchA.flowRateLps).toBe(200);
    expect(branchA.velocityMps).toBeCloseTo(4.074367, 6);
    expect(branchA.reynoldsNumber).toBeCloseTo(67530.937179, 6);
    expect(branchA.frictionFactor).toBeCloseTo(0.021018, 6);
    expect(branchA.totalPressureLossPa).toBeCloseTo(1.925952, 6);

    expect(ahu.flowRateLps).toBe(400);
    expect(ahu.velocityMps).toBeNull();
    expect(ahu.reynoldsNumber).toBeNull();
    expect(ahu.localPressureLossPa).toBe(150);
    expect(ahu.totalPressureLossPa).toBe(150);

    expect(terminal.flowRateLps).toBe(200);
    expect(terminal.velocityMps).toBeNull();
    expect(terminal.reynoldsNumber).toBeNull();
    expect(terminal.localPressureLossPa).toBe(30);
    expect(terminal.totalPressureLossPa).toBe(30);
  });

  it("includes AHU and terminal component pressure losses", () => {
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
        id: "node-terminal",
        kind: "endpoint",
        position: { x: 2, y: 0, z: 0 }
      })
    );
    graph.addComponent(
      createAhu({
        id: "ahu-1",
        nodeId: "node-ahu",
        devicePressureLossPa: 175
      })
    );
    graph.addComponent(
      createDuctSegment({
        id: "duct-1",
        startNodeId: "node-ahu",
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
        designFlowRateLps: 200,
        referencePressureLossPa: 45,
        referencePressureLossSource: "override"
      })
    );

    const analysis = analyzeDuctNetworkPerformance(graph);
    const ahu = getComponentPerformanceResult(analysis, "ahu-1");
    const terminal = getComponentPerformanceResult(analysis, "terminal-1");

    expect(ahu.totalPressureLossPa).toBe(175);
    expect(ahu.localPressureLossPa).toBe(175);
    expect(terminal.totalPressureLossPa).toBe(45);
    expect(terminal.localPressureLossPa).toBe(45);
  });

  it("includes local loss coefficients in total component pressure loss", () => {
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
        id: "node-terminal",
        kind: "endpoint",
        position: { x: 2, y: 0, z: 0 }
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
        id: "duct-1",
        startNodeId: "node-ahu",
        endNodeId: "node-terminal",
        diameterMm: 250,
        lengthMeters: 3,
        localLossCoefficient: 0.75,
        designFlowRateLps: 200
      })
    );
    graph.addComponent(
      createTerminalDevice({
        id: "terminal-1",
        nodeId: "node-terminal",
        terminalType: "supply",
        designFlowRateLps: 200
      })
    );

    const analysis = analyzeDuctNetworkPerformance(graph);
    const duct = getComponentPerformanceResult(analysis, "duct-1");

    expect(duct.localPressureLossPa).toBeCloseTo(7.470208, 6);
    expect(duct.totalPressureLossPa).toBeGreaterThan(duct.frictionPressureLossPa);
  });
});
