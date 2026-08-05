/**
 * Asset API — domain types and in-memory repositories (Phase 11).
 *
 * Repositories for: models, scenes, camera keyframes, shaders, licenses,
 * audio assets, video assets, lottie assets.
 * All repos are in-memory for this wave; Postgres-backed layer arrives later.
 */

// ---------------------------------------------------------------------------
// Domain: Model Asset
// ---------------------------------------------------------------------------

export type ModelFormat = 'glb' | 'gltf' | 'usdz' | 'step' | 'stp' | 'iges' | 'igs' | 'fbx' | 'obj';

export interface ModelAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly uploaderId: string;
  readonly name: string;
  readonly format: ModelFormat;
  readonly sourceUrl: string;
  readonly derivedUrl: string;
  readonly thumbnailUrl?: string;
  readonly polyCount: number;
  readonly textureCount: number;
  readonly hasAnimations: boolean;
  readonly cadSourceUrl?: string;
  readonly licenseId?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: Scene
// ---------------------------------------------------------------------------

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }

export interface Light {
  readonly kind: 'directional' | 'point' | 'spot';
  readonly position?: Vec3;
  readonly target?: Vec3;
  readonly color: string;
  readonly intensity: number;
  readonly castShadow?: boolean;
  readonly spotAngle?: number;
}

export interface CameraPreset {
  readonly name: string;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly roll?: number;
}

export interface PBRMaterial {
  readonly baseColor?: string;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly normalMapUrl?: string;
  readonly emissiveColor?: string;
  readonly emissiveIntensity?: number;
  readonly occlusionStrength?: number;
}

export interface Environment {
  readonly envMapUrls?: readonly string[];
  readonly exposure?: number;
  readonly rotationY?: number;
}

export interface Scene {
  readonly id: string;
  readonly modelAssetId: string;
  readonly environment: Environment;
  readonly lights: readonly Light[];
  readonly cameras: readonly CameraPreset[];
  readonly materials: Record<string, PBRMaterial>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: Camera Keyframe
// ---------------------------------------------------------------------------

export interface BezierEasing {
  readonly p1x: number;
  readonly p1y: number;
  readonly p2x: number;
  readonly p2y: number;
}

export type CameraKeyframeTrigger = 'auto' | 'click' | 'scroll' | 'data';

export interface CameraKeyframe {
  readonly id: string;
  readonly slideId: string;
  readonly sceneId?: string;
  readonly orderIndex: number;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly roll: number;
  readonly easing: BezierEasing;
  readonly durationMs: number;
  readonly trigger: CameraKeyframeTrigger;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: Shader
// ---------------------------------------------------------------------------

export type ShaderKind = 'background' | 'particle' | 'material' | 'post';

export interface ShaderInput {
  readonly type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'texture2d' | 'sampler';
  readonly default?: unknown;
  readonly description?: string;
}

export interface Shader {
  readonly id: string;
  readonly workspaceId: string;
  readonly authorId: string;
  readonly name: string;
  readonly kind: ShaderKind;
  readonly sourceWgsl: string;
  readonly sourceGlsl: string;
  readonly inputs: Record<string, ShaderInput>;
  readonly published: boolean;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: License
// ---------------------------------------------------------------------------

export interface License {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly source: string;
  readonly termsUrl?: string;
  readonly expiresAt?: string;
  readonly seats?: number;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface ModelAssetRepository {
  insert(record: ModelAsset): Promise<void>;
  update(id: string, patch: Partial<Omit<ModelAsset, 'id' | 'createdAt'>>): Promise<ModelAsset>;
  findById(id: string): Promise<ModelAsset | null>;
  listByWorkspace(workspaceId: string): Promise<ModelAsset[]>;
  delete(id: string): Promise<void>;
}

export interface SceneRepository {
  insert(record: Scene): Promise<void>;
  update(id: string, patch: Partial<Omit<Scene, 'id' | 'createdAt'>>): Promise<Scene>;
  findById(id: string): Promise<Scene | null>;
  listByWorkspace(workspaceId: string, modelAssetId?: string): Promise<Scene[]>;
  delete(id: string): Promise<void>;
}

export interface CameraKeyframeRepository {
  insert(record: CameraKeyframe): Promise<void>;
  update(id: string, patch: Partial<Omit<CameraKeyframe, 'id' | 'createdAt'>>): Promise<CameraKeyframe>;
  findById(id: string): Promise<CameraKeyframe | null>;
  listBySlide(slideId: string): Promise<CameraKeyframe[]>;
  delete(id: string): Promise<void>;
  nextOrderIndex(slideId: string): Promise<number>;
}

export interface ShaderRepository {
  insert(record: Shader): Promise<void>;
  update(id: string, patch: Partial<Omit<Shader, 'id' | 'createdAt'>>): Promise<Shader>;
  findById(id: string): Promise<Shader | null>;
  listByWorkspace(workspaceId: string, kind?: ShaderKind): Promise<Shader[]>;
  delete(id: string): Promise<void>;
}

export interface LicenseRepository {
  insert(record: License): Promise<void>;
  update(id: string, patch: Partial<Omit<License, 'id' | 'createdAt'>>): Promise<License>;
  findById(id: string): Promise<License | null>;
  listByWorkspace(workspaceId: string): Promise<License[]>;
  delete(id: string): Promise<void>;
  /** Check if any model asset references this license. */
  isReferencedByModel(licenseId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryModelAssetRepository implements ModelAssetRepository {
  private store = new Map<string, ModelAsset>();

  async insert(record: ModelAsset): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<ModelAsset, 'id' | 'createdAt'>>): Promise<ModelAsset> {
    const existing = this.store.get(id);
    if (!existing) throw new ModelNotFoundError(id);
    const updated: ModelAsset = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<ModelAsset | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<ModelAsset[]> {
    if (workspaceId === '*') return [...this.store.values()];
    return [...this.store.values()].filter(r => r.workspaceId === workspaceId);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new ModelNotFoundError(id);
    this.store.delete(id);
  }
}

export class InMemorySceneRepository implements SceneRepository {
  private store = new Map<string, Scene>();

  async insert(record: Scene): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<Scene, 'id' | 'createdAt'>>): Promise<Scene> {
    const existing = this.store.get(id);
    if (!existing) throw new SceneNotFoundError(id);
    const updated: Scene = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<Scene | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(_workspaceId: string, modelAssetId?: string): Promise<Scene[]> {
    // Scenes don't have workspaceId directly; they reference modelAssetId.
    // For simplicity, list all and optionally filter by modelAssetId.
    const scenes = [...this.store.values()];
    if (modelAssetId) return scenes.filter(s => s.modelAssetId === modelAssetId);
    return scenes;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new SceneNotFoundError(id);
    this.store.delete(id);
  }
}

export class InMemoryCameraKeyframeRepository implements CameraKeyframeRepository {
  private store = new Map<string, CameraKeyframe>();

  async insert(record: CameraKeyframe): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<CameraKeyframe, 'id' | 'createdAt'>>): Promise<CameraKeyframe> {
    const existing = this.store.get(id);
    if (!existing) throw new CameraKeyframeNotFoundError(id);
    const updated: CameraKeyframe = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<CameraKeyframe | null> {
    return this.store.get(id) ?? null;
  }

  async listBySlide(slideId: string): Promise<CameraKeyframe[]> {
    return [...this.store.values()]
      .filter(k => k.slideId === slideId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new CameraKeyframeNotFoundError(id);
    this.store.delete(id);
  }

  async nextOrderIndex(slideId: string): Promise<number> {
    const keys = [...this.store.values()].filter(k => k.slideId === slideId);
    if (keys.length === 0) return 0;
    return Math.max(...keys.map(k => k.orderIndex)) + 1;
  }
}

export class InMemoryShaderRepository implements ShaderRepository {
  private store = new Map<string, Shader>();

  async insert(record: Shader): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<Shader, 'id' | 'createdAt'>>): Promise<Shader> {
    const existing = this.store.get(id);
    if (!existing) throw new ShaderNotFoundError(id);
    const updated: Shader = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<Shader | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string, kind?: ShaderKind): Promise<Shader[]> {
    let shaders = [...this.store.values()].filter(s => s.workspaceId === workspaceId);
    if (kind) shaders = shaders.filter(s => s.kind === kind);
    return shaders;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new ShaderNotFoundError(id);
    this.store.delete(id);
  }
}

export class InMemoryLicenseRepository implements LicenseRepository {
  private store = new Map<string, License>();
  private modelRepo: ModelAssetRepository;

  constructor(modelRepo: ModelAssetRepository, seedLicenses?: License[]) {
    this.modelRepo = modelRepo;
    if (seedLicenses) {
      for (const lic of seedLicenses) {
        this.store.set(lic.id, lic);
      }
    }
  }

  async insert(record: License): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<License, 'id' | 'createdAt'>>): Promise<License> {
    const existing = this.store.get(id);
    if (!existing) throw new LicenseNotFoundError(id);
    const updated: License = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<License | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<License[]> {
    return [...this.store.values()].filter(l => l.workspaceId === workspaceId);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new LicenseNotFoundError(id);
    this.store.delete(id);
  }

  async isReferencedByModel(licenseId: string): Promise<boolean> {
    const models = await this.modelRepo.listByWorkspace('*');
    return models.some(m => m.licenseId === licenseId);
  }
}

// ---------------------------------------------------------------------------
// Domain: Audio Asset
// ---------------------------------------------------------------------------

export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | 'aac';

export interface AudioTrack {
  readonly id: string;
  readonly kind: 'music' | 'voiceover' | 'sfx' | 'ambient';
  readonly volume: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
  readonly startOffsetMs?: number;
  readonly durationMs: number;
}

export interface AudioAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly uploaderId: string;
  readonly name: string;
  readonly format: AudioFormat;
  readonly sourceUrl: string;
  readonly derivedUrl: string;
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitrateKbps?: number;
  readonly waveformPeaks?: readonly number[];
  readonly licenseId?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: Video Asset
// ---------------------------------------------------------------------------

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi';

export interface VideoChapter {
  readonly id: string;
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface VideoCaptionTrack {
  readonly id: string;
  readonly language: string;
  readonly label: string;
  readonly vttUrl: string;
  readonly default?: boolean;
}

export interface VideoAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly uploaderId: string;
  readonly name: string;
  readonly format: VideoFormat;
  readonly sourceUrl: string;
  readonly derivedUrl: string;
  readonly thumbnailUrl?: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly hasAudio: boolean;
  readonly chapters: readonly VideoChapter[];
  readonly captions: readonly VideoCaptionTrack[];
  readonly licenseId?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain: Lottie Asset
// ---------------------------------------------------------------------------

export type LottieFormat = 'json' | 'bodymovin';

export interface LottieLayer {
  readonly name: string;
  readonly type: number;
  readonly visible: boolean;
  readonly hasMasks: boolean;
  readonly hasMatte: boolean;
}

export interface LottieAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly uploaderId: string;
  readonly name: string;
  readonly format: LottieFormat;
  readonly sourceUrl: string;
  readonly derivedUrl: string;
  readonly thumbnailUrl?: string;
  readonly durationMs: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly layerCount: number;
  readonly layers: readonly LottieLayer[];
  readonly sanitized: boolean;
  readonly sanitizedWarnings?: readonly string[];
  readonly licenseId?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Repository interfaces — Audio / Video / Lottie
// ---------------------------------------------------------------------------

export interface AudioAssetRepository {
  insert(record: AudioAsset): Promise<void>;
  update(id: string, patch: Partial<Omit<AudioAsset, 'id' | 'createdAt'>>): Promise<AudioAsset>;
  findById(id: string): Promise<AudioAsset | null>;
  listByWorkspace(workspaceId: string): Promise<AudioAsset[]>;
  delete(id: string): Promise<void>;
}

export interface VideoAssetRepository {
  insert(record: VideoAsset): Promise<void>;
  update(id: string, patch: Partial<Omit<VideoAsset, 'id' | 'createdAt'>>): Promise<VideoAsset>;
  findById(id: string): Promise<VideoAsset | null>;
  listByWorkspace(workspaceId: string): Promise<VideoAsset[]>;
  delete(id: string): Promise<void>;
}

export interface LottieAssetRepository {
  insert(record: LottieAsset): Promise<void>;
  update(id: string, patch: Partial<Omit<LottieAsset, 'id' | 'createdAt'>>): Promise<LottieAsset>;
  findById(id: string): Promise<LottieAsset | null>;
  listByWorkspace(workspaceId: string): Promise<LottieAsset[]>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementations — Audio / Video / Lottie
// ---------------------------------------------------------------------------

export class InMemoryAudioAssetRepository implements AudioAssetRepository {
  private store = new Map<string, AudioAsset>();

  async insert(record: AudioAsset): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<AudioAsset, 'id' | 'createdAt'>>): Promise<AudioAsset> {
    const existing = this.store.get(id);
    if (!existing) throw new AudioAssetNotFoundError(id);
    const updated: AudioAsset = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<AudioAsset | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<AudioAsset[]> {
    if (workspaceId === '*') return [...this.store.values()];
    return [...this.store.values()].filter(r => r.workspaceId === workspaceId);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new AudioAssetNotFoundError(id);
    this.store.delete(id);
  }
}

export class InMemoryVideoAssetRepository implements VideoAssetRepository {
  private store = new Map<string, VideoAsset>();

  async insert(record: VideoAsset): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<VideoAsset, 'id' | 'createdAt'>>): Promise<VideoAsset> {
    const existing = this.store.get(id);
    if (!existing) throw new VideoAssetNotFoundError(id);
    const updated: VideoAsset = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<VideoAsset | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<VideoAsset[]> {
    if (workspaceId === '*') return [...this.store.values()];
    return [...this.store.values()].filter(r => r.workspaceId === workspaceId);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new VideoAssetNotFoundError(id);
    this.store.delete(id);
  }
}

export class InMemoryLottieAssetRepository implements LottieAssetRepository {
  private store = new Map<string, LottieAsset>();

  async insert(record: LottieAsset): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<LottieAsset, 'id' | 'createdAt'>>): Promise<LottieAsset> {
    const existing = this.store.get(id);
    if (!existing) throw new LottieAssetNotFoundError(id);
    const updated: LottieAsset = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<LottieAsset | null> {
    return this.store.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<LottieAsset[]> {
    if (workspaceId === '*') return [...this.store.values()];
    return [...this.store.values()].filter(r => r.workspaceId === workspaceId);
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new LottieAssetNotFoundError(id);
    this.store.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ModelNotFoundError extends Error {
  readonly code = 'MODEL_NOT_FOUND' as const;
  constructor(public readonly modelId: string) {
    super(`Model ${modelId} not found`);
    this.name = 'ModelNotFoundError';
  }
}

export class SceneNotFoundError extends Error {
  readonly code = 'SCENE_NOT_FOUND' as const;
  constructor(public readonly sceneId: string) {
    super(`Scene ${sceneId} not found`);
    this.name = 'SceneNotFoundError';
  }
}

export class CameraKeyframeNotFoundError extends Error {
  readonly code = 'CAMERA_KEYFRAME_NOT_FOUND' as const;
  constructor(public readonly keyframeId: string) {
    super(`Camera keyframe ${keyframeId} not found`);
    this.name = 'CameraKeyframeNotFoundError';
  }
}

export class ShaderNotFoundError extends Error {
  readonly code = 'SHADER_NOT_FOUND' as const;
  constructor(public readonly shaderId: string) {
    super(`Shader ${shaderId} not found`);
    this.name = 'ShaderNotFoundError';
  }
}

export class LicenseNotFoundError extends Error {
  readonly code = 'LICENSE_NOT_FOUND' as const;
  constructor(public readonly licenseId: string) {
    super(`License ${licenseId} not found`);
    this.name = 'LicenseNotFoundError';
  }
}

export class LicenseReferencedError extends Error {
  readonly code = 'LICENSE_REFERENCED' as const;
  constructor(public readonly licenseId: string) {
    super(`License ${licenseId} is referenced by model assets and cannot be deleted`);
    this.name = 'LicenseReferencedError';
  }
}

export class AudioAssetNotFoundError extends Error {
  readonly code = 'AUDIO_NOT_FOUND' as const;
  constructor(public readonly audioId: string) {
    super(`Audio asset ${audioId} not found`);
    this.name = 'AudioAssetNotFoundError';
  }
}

export class VideoAssetNotFoundError extends Error {
  readonly code = 'VIDEO_NOT_FOUND' as const;
  constructor(public readonly videoId: string) {
    super(`Video asset ${videoId} not found`);
    this.name = 'VideoAssetNotFoundError';
  }
}

export class LottieAssetNotFoundError extends Error {
  readonly code = 'LOTTIE_NOT_FOUND' as const;
  constructor(public readonly lottieId: string) {
    super(`Lottie asset ${lottieId} not found`);
    this.name = 'LottieAssetNotFoundError';
  }
}
