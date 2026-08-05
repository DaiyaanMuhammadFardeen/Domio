/**
 * @domio/3d-engine — renderer contract (Phase 11 M1.1).
 *
 * Typed contract consumed by every downstream 3D feature: the renderer
 * factory, loaders, LOD selection, budget enforcement, camera keyframes,
 * particles, and the editor/web-viewer viewports. Kept framework-agnostic
 * so WebGL2 and WebGPU backends (and the mock contexts used in CI) all
 * satisfy the same surface.
 */

// ----- Math primitives -----

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Mat4 {
  /** Column-major 16 floats, matching both WebGL2 and WebGPU conventions. */
  elements: Float32Array;
}

// ----- Performance tiers (per /docs/3d-motion-media.md §8) -----

export type SceneTier = 'hero' | 'standard' | 'background';

export interface DrawCallBudget {
  tier: SceneTier;
  maxTriangles: number;
  maxLights: number;
  maxCameraPaths: number;
  maxParticles: number;
  /** Frame budget in milliseconds for a 60 fps target. */
  frameMs: number;
}

export const DRAW_CALL_BUDGETS: Record<SceneTier, DrawCallBudget> = {
  hero: {
    tier: 'hero',
    maxTriangles: 1_500_000,
    maxLights: 4,
    maxCameraPaths: 1,
    maxParticles: 250_000,
    frameMs: 16,
  },
  standard: {
    tier: 'standard',
    maxTriangles: 250_000,
    maxLights: 2,
    maxCameraPaths: 1,
    maxParticles: 50_000,
    frameMs: 16,
  },
  background: {
    tier: 'background',
    maxTriangles: 50_000,
    maxLights: 1,
    maxCameraPaths: 0,
    maxParticles: 10_000,
    frameMs: 16,
  },
};

// ----- LOD -----

export type LODLevel = 0 | 1 | 2 | 3;

export interface LODSelection {
  level: LODLevel;
  /** Triangle count for the selected LOD. */
  triangleCount: number;
  /** Screen-space radius in pixels that drove the selection. */
  screenRadiusPx: number;
  /** Distance from camera that drove the selection. */
  distance: number;
}

// ----- Lights -----

export type LightKind = 'directional' | 'point' | 'spot' | 'ambient';

export interface SceneLight {
  kind: LightKind;
  /** Direction (directional/spot) or position (point/spot). */
  direction?: Vec3;
  position?: Vec3;
  color: string;
  intensity: number;
  /** Spot cone angle in degrees. */
  angleDeg?: number;
}

// ----- Camera -----

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fovDeg: number;
  rollDeg: number;
}

export interface CameraKeyframe extends CameraPose {
  timeMs: number;
  /** Cubic Bezier control points, e.g. [0.42, 0, 0.58, 1]. */
  easing: [number, number, number, number];
  durationMs: number;
  trigger: 'auto' | 'click' | 'scroll' | 'data';
}

// ----- Render plan -----

export interface RenderPlan {
  /** Mesh id → LOD selection, chosen by the budget enforcer. */
  lodSelection: Record<string, LODSelection>;
  lights: SceneLight[];
  camera: CameraPose;
  /** Active particle emitters (id → particle count). */
  particleCounts: Record<string, number>;
  /** When true, the renderer must fall back to a simpler path. */
  degraded: boolean;
  tier: SceneTier;
}

// ----- Renderer abstraction -----

export type RendererKind = 'webgl2' | 'webgpu';

export interface RendererCapabilities {
  kind: RendererKind;
  /** Max supported triangle count before auto-decimation. */
  maxTriangles: number;
  maxParticles: number;
  /** Extension availability, e.g. 'EXT_color_buffer_float'. */
  extensions: string[];
  /** WebGPU uplift: 5x particle budget vs WebGL2. */
  particleUplift: number;
}

export interface RendererLike {
  readonly kind: RendererKind;
  readonly capabilities: RendererCapabilities;
  render(plan: RenderPlan): void;
  /** Recover from context loss; returns true when a fallback was created. */
  onContextLost(): boolean;
  dispose(): void;
}

export interface RendererFactoryContext {
  /** `navigator.gpu` equivalent; undefined when WebGPU is unavailable. */
  gpu?: unknown;
  canvas: unknown;
  /** Used to detect context loss in the mock surface. */
  addEventListener?: (type: string, handler: () => void) => void;
}

export interface RendererFactory {
  /**
   * Feature-detect: prefer WebGPU when available, else WebGL2. Returns
   * null when neither is available (callers must surface a placeholder).
   */
  create(ctx: RendererFactoryContext): RendererLike | null;
}

// ----- Assets -----

export type ModelFormat =
  | 'glb'
  | 'gltf'
  | 'usdz'
  | 'step'
  | 'stp'
  | 'iges'
  | 'igs'
  | 'fbx'
  | 'obj';

export interface ModelAssetInfo {
  id: string;
  format: ModelFormat;
  sourceUrl: string;
  derivedUrl: string;
  thumbnailUrl?: string;
  polyCount: number;
  textureCount: number;
  hasAnimations: boolean;
  cadSourceUrl?: string;
  licenseId?: string;
  upAxis: 'y-up' | 'z-up';
}

export interface LoadedModel {
  assetId: string;
  /** Nodes in the scene graph (mirrors GLTF node hierarchy). */
  nodes: ModelNode[];
  meshes: ModelMesh[];
  materials: Record<string, ModelMaterial>;
  animations: ModelAnimation[];
  /** Scene-bounding radius in world units (for LOD + camera framing). */
  boundingRadius: number;
}

export interface ModelNode {
  id: string;
  name: string;
  parentId: string | null;
  transform: Mat4;
  meshId?: string;
}

export interface ModelMesh {
  id: string;
  name: string;
  /** Vertex attribute buffers consumed by the renderer. */
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  materialId: string;
  /** Axis-aligned bounding box (local space). */
  bounds: { min: Vec3; max: Vec3 };
}

export interface ModelMaterial {
  id: string;
  name: string;
  baseColor: string;
  metallic: number;
  roughness: number;
  opacity: number;
  /** Texture URLs; missing textures render checkerboard + console warn. */
  textures: Record<'baseColor' | 'normal' | 'metallicRoughness' | 'emissive', string | undefined>;
}

export interface ModelAnimation {
  id: string;
  name: string;
  durationMs: number;
  /** Animated node id → keyframed channels. */
  channels: Array<{
    nodeId: string;
    property: 'position' | 'rotation' | 'scale';
    keyframes: Array<{ timeMs: number; value: Float32Array }>;
  }>;
}
