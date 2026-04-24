import { useEffect, useRef, useState } from "react";
import type { RouteAnalysisResult } from "../calc";
import type { AirSystemType } from "../airSystems";
import type { EditorDocument } from "../ui/editorState";
import {
  createFlowAnimationController,
  type FlowAnimationController
} from "./animation";
import { createOrbitCamera, type OrbitCameraRig } from "./camera";
import {
  buildView3DSceneData,
  createView3DScene,
  disposeView3DScene,
  syncView3DScene
} from "./scene";
import {
  createView3DRenderer,
  type View3DRendererHandle
} from "./renderer";

interface View3DProps {
  document: EditorDocument;
  analysis: RouteAnalysisResult | null;
  ductAirSystems: Record<string, AirSystemType>;
}

interface View3DRuntime {
  scene: ReturnType<typeof createView3DScene>;
  cameraRig: OrbitCameraRig;
  rendererHandle: View3DRendererHandle;
  flowAnimation: FlowAnimationController;
  animationFrameId: number;
  resizeObserver: ResizeObserver | null;
  reducedMotionMediaQuery: MediaQueryList | null;
  handleReducedMotionChange: () => void;
  resize: () => void;
}

type View3DStatus = "initializing" | "ready" | "unsupported";

export function View3D({ document, analysis, ductAirSystems }: View3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<View3DRuntime | null>(null);
  const [status, setStatus] = useState<View3DStatus>("initializing");
  const sceneData = buildView3DSceneData(document, analysis, ductAirSystems);
  const sceneDataRef = useRef(sceneData);

  sceneDataRef.current = sceneData;

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    if (typeof window === "undefined" || typeof WebGLRenderingContext === "undefined") {
      setStatus("unsupported");

      return;
    }

    try {
      const scene = createView3DScene();
      const rendererHandle = createView3DRenderer(host);
      const cameraRig = createOrbitCamera(rendererHandle.renderer.domElement);
      const flowAnimation = createFlowAnimationController(scene);
      const reducedMotionMediaQuery =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-reduced-motion: reduce)")
          : null;
      const getFlowAnimationOptions = () => ({
        reducedMotion: reducedMotionMediaQuery?.matches ?? false
      });
      const resize = () => {
        const bounds = host.getBoundingClientRect();
        const width = Math.round(bounds.width || host.clientWidth || 320);
        const height = Math.round(bounds.height || host.clientHeight || 320);

        rendererHandle.resize(width, height);
        cameraRig.resize(width, height);
      };
      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              resize();
            });
      const handleReducedMotionChange = () => {
        flowAnimation.sync(sceneDataRef.current, getFlowAnimationOptions());
      };
      const runtime: View3DRuntime = {
        scene,
        cameraRig,
        rendererHandle,
        flowAnimation,
        animationFrameId: 0,
        resizeObserver,
        reducedMotionMediaQuery,
        handleReducedMotionChange,
        resize
      };

      runtime.resize();
      runtime.resizeObserver?.observe(host);
      syncView3DScene(scene, sceneData);
      runtime.flowAnimation.sync(sceneData, getFlowAnimationOptions());
      cameraRig.focus(sceneData.bounds);

      let previousFrameTimeMs = window.performance.now();
      const renderFrame = () => {
        runtime.animationFrameId = window.requestAnimationFrame(renderFrame);
        const frameTimeMs = window.performance.now();
        const deltaSeconds = Math.min(
          0.08,
          Math.max(0, (frameTimeMs - previousFrameTimeMs) / 1000)
        );

        previousFrameTimeMs = frameTimeMs;
        cameraRig.controls.update();
        runtime.flowAnimation.update(deltaSeconds);
        rendererHandle.renderer.render(scene, cameraRig.camera);
      };

      renderFrame();
      window.addEventListener("resize", runtime.resize);
      attachMediaQueryListener(
        runtime.reducedMotionMediaQuery,
        runtime.handleReducedMotionChange
      );
      runtimeRef.current = runtime;
      setStatus("ready");

      return () => {
        window.removeEventListener("resize", runtime.resize);
        detachMediaQueryListener(
          runtime.reducedMotionMediaQuery,
          runtime.handleReducedMotionChange
        );
        window.cancelAnimationFrame(runtime.animationFrameId);
        runtime.resizeObserver?.disconnect();
        runtimeRef.current = null;
        runtime.flowAnimation.dispose();
        cameraRig.dispose();
        disposeView3DScene(scene);
        rendererHandle.dispose();
      };
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;

    if (!runtime) {
      return;
    }

    syncView3DScene(runtime.scene, sceneData);
    runtime.flowAnimation.sync(sceneData, {
      reducedMotion: runtime.reducedMotionMediaQuery?.matches ?? false
    });
    runtime.cameraRig.focus(sceneData.bounds);
    runtime.rendererHandle.renderer.render(runtime.scene, runtime.cameraRig.camera);
  }, [analysis, document, ductAirSystems, sceneData]);

  return (
    <section className="viewer-stage" aria-label="3D preview">
      <div className="editor-stage-header">
        <div>
          <p className="section-kicker">3D visualization</p>
          <h2>Read-only model preview</h2>
        </div>
        <div className="editor-stage-status">
          <span>Orbit camera</span>
          <span>{sceneData.ducts.length} ducts rendered</span>
          <span className={sceneData.fanRunning ? "status-running" : undefined}>
            Flow {sceneData.fanRunning ? "running" : "stopped"}
          </span>
        </div>
      </div>

      <div className="viewer-shell">
        <div ref={hostRef} className="viewer-canvas" />

        {status !== "ready" ? (
          <div className="viewer-overlay" aria-live="polite">
            <strong>
              {status === "initializing"
                ? "Preparing 3D preview..."
                : "3D preview needs a WebGL-capable browser."}
            </strong>
            <span>
              {status === "initializing"
                ? "The view will sync automatically when the model is ready."
                : "The 2D editor and engineering calculations still remain available."}
            </span>
          </div>
        ) : null}

        <div className="viewer-legend">
          <span className="legend-chip">Blue: network</span>
          <span className="legend-chip legend-chip-supply-critical">Green: supply critical</span>
          <span className="legend-chip legend-chip-extract-critical">Yellow: extract critical</span>
          <span className="legend-chip legend-chip-flow">Particles: airflow</span>
          <span className="legend-chip">Read-only</span>
        </div>
      </div>
    </section>
  );
}

function attachMediaQueryListener(
  mediaQuery: MediaQueryList | null,
  listener: () => void
): void {
  if (!mediaQuery) {
    return;
  }

  const legacyMediaQuery = mediaQuery as MediaQueryList & {
    addListener?: (nextListener: () => void) => void;
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);

    return;
  }

  legacyMediaQuery.addListener?.(listener);
}

function detachMediaQueryListener(
  mediaQuery: MediaQueryList | null,
  listener: () => void
): void {
  if (!mediaQuery) {
    return;
  }

  const legacyMediaQuery = mediaQuery as MediaQueryList & {
    removeListener?: (nextListener: () => void) => void;
  };

  if (typeof mediaQuery.removeEventListener === "function") {
    mediaQuery.removeEventListener("change", listener);

    return;
  }

  legacyMediaQuery.removeListener?.(listener);
}
