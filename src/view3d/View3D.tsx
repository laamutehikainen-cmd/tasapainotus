import { useEffect, useRef, useState } from "react";
import type { RouteAnalysisResult } from "../calc";
import type { AirSystemType } from "../airSystems";
import type { EditorDocument } from "../ui/editorState";
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
  animationFrameId: number;
  resize: () => void;
}

type View3DStatus = "initializing" | "ready" | "unsupported";

export function View3D({ document, analysis, ductAirSystems }: View3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<View3DRuntime | null>(null);
  const [status, setStatus] = useState<View3DStatus>("initializing");
  const sceneData = buildView3DSceneData(document, analysis, ductAirSystems);

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
      const runtime: View3DRuntime = {
        scene,
        cameraRig,
        rendererHandle,
        animationFrameId: 0,
        resize: () => {
          const width = host.clientWidth || 320;
          const height = host.clientHeight || 320;

          rendererHandle.resize(width, height);
          cameraRig.resize(width, height);
        }
      };

      runtime.resize();
      syncView3DScene(scene, sceneData);
      cameraRig.focus(sceneData.bounds);

      const renderFrame = () => {
        runtime.animationFrameId = window.requestAnimationFrame(renderFrame);
        cameraRig.controls.update();
        rendererHandle.renderer.render(scene, cameraRig.camera);
      };

      renderFrame();
      window.addEventListener("resize", runtime.resize);
      runtimeRef.current = runtime;
      setStatus("ready");

      return () => {
        window.removeEventListener("resize", runtime.resize);
        window.cancelAnimationFrame(runtime.animationFrameId);
        runtimeRef.current = null;
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
          <span className="legend-chip">Read-only</span>
        </div>
      </div>
    </section>
  );
}
