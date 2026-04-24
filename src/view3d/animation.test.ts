import { createFlowAnimationData, calculateTerminalThrowDistanceMeters } from "./animation";
import type { View3DSceneData } from "./scene";

describe("createFlowAnimationData", () => {
  it("creates duct particles and terminal streams for animated flow", () => {
    const sceneData: View3DSceneData = {
      fanRunning: true,
      bounds: null,
      ducts: [
        {
          id: "duct-supply",
          start: { x: 1, y: 2, z: 1.8 },
          end: { x: 4, y: 2, z: 1.8 },
          flowStart: { x: 1, y: 2, z: 1.8 },
          flowEnd: { x: 4, y: 2, z: 1.8 },
          diameterMeters: 0.16,
          isCritical: true,
          criticalSide: "supply",
          airSystem: "supply"
        },
        {
          id: "duct-extract",
          start: { x: 5, y: 2, z: 1.8 },
          end: { x: 8, y: 2, z: 1.8 },
          flowStart: { x: 8, y: 2, z: 1.8 },
          flowEnd: { x: 5, y: 2, z: 1.8 },
          diameterMeters: 0.2,
          isCritical: false,
          criticalSide: null,
          airSystem: "extract"
        }
      ],
      endpoints: [
        {
          id: "terminal-supply",
          type: "terminal",
          label: "Supply terminal",
          position: { x: 4, y: 2, z: 0 },
          isCritical: true,
          criticalSide: "supply",
          connectionDirection: { x: -1, y: 0, z: 0 },
          connectedDuctDiameterMeters: 0.16,
          geometry: {
            type: "terminal",
            markerSizeMeters: 0.4,
            terminalType: "supply",
            referencePressureLossPa: 30
          }
        },
        {
          id: "terminal-extract",
          type: "terminal",
          label: "Extract terminal",
          position: { x: 8, y: 2, z: 0 },
          isCritical: false,
          criticalSide: null,
          connectionDirection: { x: -1, y: 0, z: 0 },
          connectedDuctDiameterMeters: 0.2,
          geometry: {
            type: "terminal",
            markerSizeMeters: 0.4,
            terminalType: "exhaust",
            referencePressureLossPa: 30
          }
        }
      ]
    };

    const animationData = createFlowAnimationData(sceneData);

    expect(animationData.fanRunning).toBe(true);
    expect(animationData.particles).toHaveLength(6);
    expect(animationData.particles.every((particle) => particle.speedMetersPerSecond > 0)).toBe(true);
    expect(animationData.terminalStreams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-supply",
          airSystem: "supply",
          mode: "throw"
        }),
        expect.objectContaining({
          terminalId: "terminal-extract",
          airSystem: "extract",
          mode: "intake"
        })
      ])
    );
  });

  it("respects reduced motion by freezing a single particle midway on each duct", () => {
    const sceneData: View3DSceneData = {
      fanRunning: false,
      bounds: null,
      ducts: [
        {
          id: "duct-outdoor",
          start: { x: 0, y: 0, z: 1.8 },
          end: { x: 2, y: 0, z: 1.8 },
          flowStart: { x: 2, y: 0, z: 1.8 },
          flowEnd: { x: 0, y: 0, z: 1.8 },
          diameterMeters: 0.16,
          isCritical: false,
          criticalSide: null,
          airSystem: "outdoor"
        }
      ],
      endpoints: []
    };

    const animationData = createFlowAnimationData(sceneData, { reducedMotion: true });

    expect(animationData.reducedMotion).toBe(true);
    expect(animationData.particles).toHaveLength(1);
    expect(animationData.particles[0]).toEqual(
      expect.objectContaining({
        speedMetersPerSecond: 0,
        phaseOffset: 0.5
      })
    );
  });
});

describe("calculateTerminalThrowDistanceMeters", () => {
  it("clamps and scales terminal throw distance from reference pressure loss", () => {
    expect(calculateTerminalThrowDistanceMeters(0)).toBe(0.35);
    expect(calculateTerminalThrowDistanceMeters(30)).toBeGreaterThan(0.35);
    expect(calculateTerminalThrowDistanceMeters(400)).toBe(1.8);
  });
});
