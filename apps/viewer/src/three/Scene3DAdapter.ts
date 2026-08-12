/**
 * Scene3D adapter — minimal surface needed by S3.12 element renderers.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The full three.js renderer is wired elsewhere (M5.4 scroll-driven
 * scenes). S3.12 only needs to (a) confirm a `<canvas>` is mounted and
 * (b) tear down on unmount. The shared `ScrollDriver` from
 * `../three/scroll-driver` provides the camera pose that the inner
 * scene uses.
 *
 * This module exists so the React components below don't need to
 * depend on three.js directly — keeping the viewer bundle small.
 */

export interface ViewerScene3DConfig {
  readonly assetId: string;
  readonly sceneId?: string;
  readonly upAxis?: 'y-up' | 'z-up';
  readonly autoRotate?: boolean;
  readonly paused?: boolean;
  readonly physicsEnabled?: boolean;
  readonly reducedMotion: boolean;
}

export interface ViewerScene3D {
  attach(canvas: HTMLCanvasElement): () => void;
}

export function createViewerScene3D(_config: ViewerScene3DConfig): ViewerScene3D {
  return {
    attach(canvas: HTMLCanvasElement): () => void {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      return () => {
        // Bootstrap teardown — real renderer will cancel its RAF loop.
      };
    },
  };
}