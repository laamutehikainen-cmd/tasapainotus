import * as THREE from "three";

export interface View3DRendererHandle {
  renderer: THREE.WebGLRenderer;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createView3DRenderer(
  container: HTMLElement
): View3DRendererHandle {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(getRendererPixelRatio());
  renderer.setClearColor("#eff4f7", 0);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  container.replaceChildren(renderer.domElement);

  return {
    renderer,
    resize(width: number, height: number): void {
      renderer.setPixelRatio(getRendererPixelRatio());
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    },
    dispose(): void {
      renderer.dispose();
      container.replaceChildren();
    }
  };
}

function getRendererPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}
