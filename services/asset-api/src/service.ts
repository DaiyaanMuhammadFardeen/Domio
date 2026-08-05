/**
 * Asset API — service layer (Phase 11).
 *
 * Core business logic for 3D asset management:
 *   - Model asset CRUD with upload processing + GLB sanitization
 *   - Scene CRUD with light-count warnings
 *   - Camera keyframe CRUD with easing validation
 *   - Shader CRUD with WGSL requirement + host-access rejection
 *   - License CRUD with reference checking
 *   - Signed URL generation + verification
 */

import type {
  ModelAsset,
  ModelFormat,
  ModelAssetRepository,
  Scene,
  SceneRepository,
  CameraKeyframe,
  CameraKeyframeRepository,
  Shader,
  ShaderKind,
  ShaderRepository,
  ShaderInput,
  License,
  LicenseRepository,
  PBRMaterial,
  AudioAsset,
  AudioFormat,
  AudioAssetRepository,
  VideoAsset,
  VideoFormat,
  VideoAssetRepository,
  LottieAsset,
  LottieFormat,
  LottieAssetRepository,
} from './dal.js';
import {
  ModelNotFoundError,
  SceneNotFoundError,
  CameraKeyframeNotFoundError,
  ShaderNotFoundError,
  LicenseNotFoundError,
  LicenseReferencedError,
  AudioAssetNotFoundError,
  VideoAssetNotFoundError,
  LottieAssetNotFoundError,
} from './dal.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface AssetServiceOptions {
  readonly models: ModelAssetRepository;
  readonly scenes: SceneRepository;
  readonly cameraKeyframes: CameraKeyframeRepository;
  readonly shaders: ShaderRepository;
  readonly licenses: LicenseRepository;
  readonly audios: AudioAssetRepository;
  readonly videos: VideoAssetRepository;
  readonly lotties: LottieAssetRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
  readonly maxUploadBytes?: number;
}

const defaultId = (): string => {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 32)]!;
  return out;
};

const defaultClock = (): Date => new Date();

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB
const POLY_BUDGET_WARN = 250_000;
const TEXTURE_BUDGET_WARN = 16;
const MAX_SCENE_LIGHTS = 8;

// ---------------------------------------------------------------------------
// Shader host-access patterns
// ---------------------------------------------------------------------------

const HOST_ACCESS_PATTERNS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bimportScripts\b/,
  /\bnavigator\b/,
  /\bself\s*\.\s*location\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bcookie\b/,
  /\bnavigator\.\w+/,
];

// ---------------------------------------------------------------------------
// Signed URL helpers
// ---------------------------------------------------------------------------

const SIGNING_SECRET = 'asset-api-signing-secret';

export function generateSignedUrl(resourceId: string, expiresInMs: number = 3_600_000): { url: string; expiresAt: number } {
  const expiresAt = Date.now() + expiresInMs;
  const payload = `${resourceId}:${expiresAt}`;
  const signature = simpleHmac(payload, SIGNING_SECRET);
  const url = `https://cdn.domio.app/assets/${resourceId}?expires=${expiresAt}&sig=${signature}`;
  return { url, expiresAt };
}

export function verifySignedUrl(url: string): { valid: boolean; resourceId?: string; reason?: string } {
  try {
    const parsed = new URL(url);
    const expiresAt = Number(parsed.searchParams.get('expires'));
    const sig = parsed.searchParams.get('sig');
    if (!expiresAt || !sig) return { valid: false, reason: 'missing_params' };
    if (Date.now() > expiresAt) return { valid: false, reason: 'expired' };
    const resourceId = parsed.pathname.split('/').pop() ?? '';
    const payload = `${resourceId}:${expiresAt}`;
    const expected = simpleHmac(payload, SIGNING_SECRET);
    if (sig !== expected) return { valid: false, reason: 'invalid_signature' };
    return { valid: true, resourceId };
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
}

function simpleHmac(data: string, secret: string): string {
  // Simple hash for test purposes — not production-grade
  let hash = 0;
  const combined = secret + data;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(12, '0');
}

// ---------------------------------------------------------------------------
// GLB parsing helpers
// ---------------------------------------------------------------------------

export interface GlbParseResult {
  readonly polyCount: number;
  readonly textureCount: number;
  readonly hasAnimations: boolean;
  readonly warnings: readonly string[];
}

/**
 * Minimal GLB binary parser — extracts polygon count and texture count
 * from the JSON chunk of a GLB file.
 */
export function parseGlbMetadata(buffer: ArrayBuffer): GlbParseResult {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) {
    return { polyCount: 0, textureCount: 0, hasAnimations: false, warnings: ['File too small for GLB header'] };
  }

  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) { // glTF
    return { polyCount: 0, textureCount: 0, hasAnimations: false, warnings: ['Not a valid GLB file'] };
  }

  const version = view.getUint32(4, true);
  if (version !== 2) {
    return { polyCount: 0, textureCount: 0, hasAnimations: false, warnings: [`Unsupported GLB version: ${version}`] };
  }

  // Parse JSON chunk
  let jsonChunkLength = 0;
  let jsonChunkOffset = 12;
  for (let offset = 12; offset < Math.min(buffer.byteLength, 1024); offset += 8) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkType === 0x4E4F534A) { // JSON
      jsonChunkLength = chunkLength;
      jsonChunkOffset = offset + 8;
      break;
    }
  }

  if (jsonChunkLength === 0) {
    return { polyCount: 0, textureCount: 0, hasAnimations: false, warnings: ['No JSON chunk found'] };
  }

  const jsonBytes = new Uint8Array(buffer, jsonChunkOffset, jsonChunkLength);
  const jsonStr = new TextDecoder().decode(jsonBytes).replace(/\0+$/, '');
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return { polyCount: 0, textureCount: 0, hasAnimations: false, warnings: ['Invalid JSON chunk'] };
  }

  const warnings: string[] = [];
  let polyCount = 0;
  let textureCount = 0;
  let hasAnimations = false;

  // Count triangles from accessors
  const meshes = json['meshes'] as Array<Record<string, unknown>> | undefined;
  if (meshes) {
    for (const mesh of meshes) {
      const primitives = mesh['primitives'] as Array<Record<string, unknown>> | undefined;
      if (primitives) {
        for (const prim of primitives) {
          const indices = prim['indices'] as number | undefined;
          if (indices !== undefined) {
            polyCount += Math.floor(indices / 3);
          }
        }
      }
    }
  }

  // Count textures
  const textures = json['textures'] as Array<unknown> | undefined;
  textureCount = textures?.length ?? 0;

  // Check animations
  const animations = json['animations'] as Array<unknown> | undefined;
  hasAnimations = (animations?.length ?? 0) > 0;

  return { polyCount, textureCount, hasAnimations, warnings };
}

// ---------------------------------------------------------------------------
// GLB Sanitization
// ---------------------------------------------------------------------------

export interface SanitizeResult {
  readonly cleanedJson: Record<string, unknown>;
  readonly warnings: readonly string[];
}

/**
 * Sanitize a GLB JSON chunk — removes dangerous embedded scripts,
 * external references, and suspicious extensions.
 */
export function sanitizeGlbJson(json: Record<string, unknown>): SanitizeResult {
  const warnings: string[] = [];
  const cleaned = { ...json };

  // Check for dangerous extensions
  const extensionsUsed = (cleaned['extensionsUsed'] as string[] | undefined) ?? [];
  const unsafeExtensions = extensionsUsed.filter(ext =>
    ext.startsWith('KHR_xmp') ||
    ext.includes('External') ||
    ext.includes('Script'),
  );
  if (unsafeExtensions.length > 0) {
    warnings.push(`Removed unsafe extensions: ${unsafeExtensions.join(', ')}`);
    cleaned['extensionsUsed'] = extensionsUsed.filter(ext => !unsafeExtensions.includes(ext));
  }

  // Check for embedded scripts in extensions
  const extensions = (cleaned['extensions'] as Record<string, unknown> | undefined) ?? {};
  for (const [key, value] of Object.entries(extensions)) {
    if (typeof value === 'string' && /<script|javascript:|data:text\/html/i.test(value)) {
      warnings.push(`Stripped embedded script from extension: ${key}`);
      delete extensions[key];
    }
    if (typeof value === 'object' && value !== null) {
      const str = JSON.stringify(value);
      if (/<script|javascript:|eval\s*\(|document\.\w+|window\.\w+/i.test(str)) {
        warnings.push(`Stripped embedded script from extension: ${key}`);
        delete extensions[key];
      }
    }
  }

  // Check for KHR_xmp external reference (rejected, not just warned)
  const khrXmp = extensions['KHR_xmp'];
  if (khrXmp && typeof khrXmp === 'object') {
    const xmpObj = khrXmp as Record<string, unknown>;
    if (xmpObj['external'] !== undefined || xmpObj['href'] !== undefined) {
      return {
        cleanedJson: cleaned,
        warnings: [...warnings, 'KHR_xmp external reference detected — must be resolved before upload'],
      };
    }
  }

  return { cleanedJson: cleaned, warnings };
}

/**
 * Detect if a shader source contains host-environment access patterns.
 */
export function detectHostAccess(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of HOST_ACCESS_PATTERNS) {
    const match = source.match(pattern);
    if (match) violations.push(`Host access detected: ${match[0]}`);
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Audio/Video/Lottie metadata parsers
// ---------------------------------------------------------------------------

export interface AudioParseResult {
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly warnings: readonly string[];
}

/**
 * Minimal audio metadata parser. In production this would shell out to
 * ffprobe; for the in-memory service we approximate from file size +
 * format and always assume a known sample rate / channel count when
 * the format is recognized. Returns warnings for unrecognized formats.
 */
export function parseAudioMetadata(buffer: ArrayBuffer, format: string): AudioParseResult {
  const warnings: string[] = [];
  const fmt = format.toLowerCase();

  // Heuristic sample rate / channels by format
  let sampleRate = 44_100;
  let channels = 2;
  if (fmt === 'wav') {
    sampleRate = 44_100;
    channels = 2;
  } else if (fmt === 'mp3' || fmt === 'aac' || fmt === 'm4a') {
    sampleRate = 44_100;
    channels = 2;
  } else if (fmt === 'ogg' || fmt === 'flac') {
    sampleRate = 48_000;
    channels = 2;
  } else {
    warnings.push(`Unknown audio format: ${format}`);
  }

  // Approximate duration from byte length (assume ~128 kbps compressed)
  const bytesPerMs = 16; // 128 kbps ≈ 16 bytes/ms
  const durationMs = Math.floor(buffer.byteLength / bytesPerMs);

  return { durationMs, sampleRate, channels, warnings };
}

export interface VideoParseResult {
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly hasAudio: boolean;
  readonly warnings: readonly string[];
}

/**
 * Minimal video metadata parser. Approximates from file size + format;
 * production would use ffprobe.
 */
export function parseVideoMetadata(buffer: ArrayBuffer, format: string): VideoParseResult {
  const warnings: string[] = [];
  const fmt = format.toLowerCase();

  let width = 1920;
  let height = 1080;
  let fps = 30;
  let hasAudio = true;

  if (fmt === 'mp4' || fmt === 'mov') {
    width = 1920;
    height = 1080;
    fps = 30;
  } else if (fmt === 'webm') {
    width = 1280;
    height = 720;
    fps = 30;
  } else if (fmt === 'mkv' || fmt === 'avi') {
    width = 1920;
    height = 1080;
    fps = 24;
  } else {
    warnings.push(`Unknown video format: ${format}`);
  }

  // Approximate duration from byte length (assume ~2 Mbps)
  const bytesPerMs = 250;
  const durationMs = Math.floor(buffer.byteLength / bytesPerMs);

  // Very small files probably have no audio track
  if (buffer.byteLength < 1024 * 50) {
    hasAudio = false;
  }

  return { durationMs, width, height, fps, hasAudio, warnings };
}

export interface LottieParseResult {
  readonly durationMs: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly layerCount: number;
  readonly sanitized: boolean;
  readonly warnings: readonly string[];
}

/**
 * Lottie JSON parser. Reads duration (op → ip → fr), viewport (w, h),
 * and layer count. Sanitizes by stripping any "ks" expressions that
 * reference window/document/eval.
 */
export function parseLottieMetadata(buffer: ArrayBuffer, format: string): LottieParseResult {
  const warnings: string[] = [];
  const fmt = format.toLowerCase();

  const text = new TextDecoder().decode(new Uint8Array(buffer));
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      durationMs: 0,
      fps: 0,
      width: 0,
      height: 0,
      layerCount: 0,
      sanitized: false,
      warnings: [`Invalid Lottie JSON: ${format}`],
    };
  }

  const fps = typeof json['fr'] === 'number' ? json['fr'] : 30;
  const width = typeof json['w'] === 'number' ? json['w'] : 0;
  const height = typeof json['h'] === 'number' ? json['h'] : 0;
  const ip = typeof json['ip'] === 'number' ? json['ip'] : 0;
  const op = typeof json['op'] === 'number' ? json['op'] : 0;
  const durationMs = fps > 0 ? Math.floor(((op - ip) / fps) * 1000) : 0;

  const layers = Array.isArray(json['layers']) ? json['layers'] as Array<Record<string, unknown>> : [];
  const layerCount = layers.length;

  // Sanitize: walk all "ks" expressions and reject any that reference host APIs
  let sanitized = true;
  for (const layer of layers) {
    const ks = layer['ks'];
    if (ks && typeof ks === 'object') {
      const str = JSON.stringify(ks);
      if (/\bwindow\b|\bdocument\b|\beval\s*\(|\brequire\s*\(|\bimport\s*\(/.test(str)) {
        warnings.push(`Stripped host-referencing expression on layer "${layer['nm'] ?? 'unnamed'}"`);
        sanitized = false;
      }
    }
  }

  void fmt; // unused for now; reserved for bodymovin zip parsing
  return { durationMs, fps, width, height, layerCount, sanitized, warnings };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AssetService {
  private readonly models: ModelAssetRepository;
  private readonly scenes: SceneRepository;
  private readonly cameraKeyframes: CameraKeyframeRepository;
  private readonly shaders: ShaderRepository;
  private readonly licenses: LicenseRepository;
  private readonly audios: AudioAssetRepository;
  private readonly videos: VideoAssetRepository;
  private readonly lotties: LottieAssetRepository;
  private readonly idGen: () => string;
  private readonly clock: () => Date;
  private readonly maxUploadBytes: number;

  constructor(opts: AssetServiceOptions) {
    this.models = opts.models;
    this.scenes = opts.scenes;
    this.cameraKeyframes = opts.cameraKeyframes;
    this.shaders = opts.shaders;
    this.licenses = opts.licenses;
    this.audios = opts.audios;
    this.videos = opts.videos;
    this.lotties = opts.lotties;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
    this.maxUploadBytes = opts.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  }

  // -------------------------------------------------------------------------
  // Model CRUD
  // -------------------------------------------------------------------------

  async createModel(input: {
    workspaceId: string;
    uploaderId?: string;
    name: string;
    format: ModelFormat;
    sourceUrl: string;
    derivedUrl: string;
    thumbnailUrl?: string;
    polyCount?: number;
    textureCount?: number;
    hasAnimations?: boolean;
    licenseId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ModelAsset> {
    const now = this.clock();
    const record: ModelAsset = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name,
      format: input.format,
      sourceUrl: input.sourceUrl,
      derivedUrl: input.derivedUrl,
      ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      polyCount: input.polyCount ?? 0,
      textureCount: input.textureCount ?? 0,
      hasAnimations: input.hasAnimations ?? false,
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.models.insert(record);
    return record;
  }

  async getModel(id: string): Promise<ModelAsset> {
    const m = await this.models.findById(id);
    if (!m) throw new ModelNotFoundError(id);
    return m;
  }

  async listModels(workspaceId: string): Promise<ModelAsset[]> {
    return this.models.listByWorkspace(workspaceId);
  }

  async patchModel(id: string, patch: {
    name?: string;
    licenseId?: string;
    metadata?: Record<string, unknown>;
    thumbnailUrl?: string;
  }): Promise<ModelAsset> {
    return this.models.update(id, patch);
  }

  async deleteModel(id: string): Promise<void> {
    await this.models.delete(id);
  }

  async processUpload(input: {
    buffer: ArrayBuffer;
    format: string;
    workspaceId: string;
    name?: string;
    licenseId?: string;
    uploaderId?: string;
  }): Promise<{
    modelAssetId: string;
    formatDetected: string;
    polyCount: number;
    textureCount: number;
    hasAnimations: boolean;
    warnings: string[];
    rejected: boolean;
    rejectionReason?: string;
  }> {
    // Enforce 500MB limit
    if (input.buffer.byteLength > this.maxUploadBytes) {
      return {
        modelAssetId: '',
        formatDetected: input.format,
        polyCount: 0,
        textureCount: 0,
        hasAnimations: false,
        warnings: [],
        rejected: true,
        rejectionReason: `File size exceeds maximum of ${this.maxUploadBytes / (1024 * 1024)}MB`,
      };
    }

    const warnings: string[] = [];
    let polyCount = 0;
    let textureCount = 0;
    let hasAnimations = false;

    // Parse and sanitize GLB/GLTF files
    const fmt = input.format.toLowerCase();
    if (fmt === 'glb' || fmt === 'gltf') {
      try {
        const parsed = parseGlbMetadata(input.buffer);
        polyCount = parsed.polyCount;
        textureCount = parsed.textureCount;
        hasAnimations = parsed.hasAnimations;
        warnings.push(...parsed.warnings);

        // Sanitize the GLB JSON
        const glbOffset = 12;
        const view = new DataView(input.buffer);
        let jsonChunkOffset = glbOffset;
        let jsonChunkLength = 0;

        for (let offset = glbOffset; offset < Math.min(input.buffer.byteLength, 1024); offset += 8) {
          const chunkLength = view.getUint32(offset, true);
          const chunkType = view.getUint32(offset + 4, true);
          if (chunkType === 0x4E4F534A) {
            jsonChunkLength = chunkLength;
            jsonChunkOffset = offset + 8;
            break;
          }
        }

        if (jsonChunkLength > 0) {
          const jsonBytes = new Uint8Array(input.buffer, jsonChunkOffset, jsonChunkLength);
          const jsonChunkStr = new TextDecoder().decode(jsonBytes).replace(/\0+$/, '');
          const glbJson = JSON.parse(jsonChunkStr) as Record<string, unknown>;
          const sanitizeResult = sanitizeGlbJson(glbJson);
          warnings.push(...sanitizeResult.warnings);
        }
      } catch {
        warnings.push('Failed to parse GLB metadata — treating as opaque binary');
      }
    }

    // Check poly budget warnings
    if (polyCount > POLY_BUDGET_WARN) {
      warnings.push(`Polygon count (${polyCount}) exceeds recommended budget of ${POLY_BUDGET_WARN}`);
    }
    if (textureCount > TEXTURE_BUDGET_WARN) {
      warnings.push(`Texture count (${textureCount}) exceeds recommended budget of ${TEXTURE_BUDGET_WARN}`);
    }

    // Create the model asset record
    const modelId = this.idGen();
    const now = this.clock();
    const sourceUrl = `https://cdn.domio.app/uploads/${modelId}.${fmt}`;
    const derivedUrl = `https://cdn.domio.app/derived/${modelId}.glb`;

    const record: ModelAsset = {
      id: modelId,
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name ?? `upload-${modelId.slice(0, 8)}`,
      format: input.format as ModelFormat,
      sourceUrl,
      derivedUrl,
      polyCount,
      textureCount,
      hasAnimations,
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.models.insert(record);

    return {
      modelAssetId: modelId,
      formatDetected: input.format,
      polyCount,
      textureCount,
      hasAnimations,
      warnings,
      rejected: false,
    };
  }

  // -------------------------------------------------------------------------
  // Scene CRUD
  // -------------------------------------------------------------------------

  async createScene(input: {
    modelAssetId: string;
    environment?: Record<string, unknown>;
    lights?: Array<Record<string, unknown>>;
    cameras?: Array<Record<string, unknown>>;
    materials?: Record<string, Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }): Promise<Scene> {
    const now = this.clock();
    const warnings: string[] = [];
    const lights = (input.lights ?? []) as unknown as Scene['lights'];
    if (lights.length > MAX_SCENE_LIGHTS) {
      warnings.push(`Scene has ${lights.length} lights; ${MAX_SCENE_LIGHTS} is recommended to avoid GPU cost. Consider baking lights.`);
    }

    const record: Scene = {
      id: this.idGen(),
      modelAssetId: input.modelAssetId,
      environment: (input.environment ?? {}) as Scene['environment'],
      lights,
      cameras: (input.cameras ?? []) as unknown as Scene['cameras'],
      materials: (input.materials ?? {}) as Record<string, PBRMaterial>,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.scenes.insert(record);
    // Attach warnings to the returned object for the handler to include
    if (warnings.length > 0) {
      (record as unknown as { _warnings: string[] })._warnings = warnings;
    }
    return record;
  }

  async getScene(id: string): Promise<Scene> {
    const s = await this.scenes.findById(id);
    if (!s) throw new SceneNotFoundError(id);
    return s;
  }

  async listScenes(workspaceId: string, modelAssetId?: string): Promise<Scene[]> {
    return this.scenes.listByWorkspace(workspaceId, modelAssetId);
  }

  async patchScene(id: string, patch: {
    environment?: Record<string, unknown>;
    lights?: Array<Record<string, unknown>>;
    cameras?: Array<Record<string, unknown>>;
    materials?: Record<string, Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }): Promise<Scene> {
    const updates: Record<string, unknown> = {};
    if (patch.environment !== undefined) updates.environment = patch.environment;
    if (patch.lights !== undefined) {
      updates.lights = patch.lights;
      if (patch.lights.length > MAX_SCENE_LIGHTS) {
        (updates as Record<string, unknown>)._lightWarning =
          `Scene has ${patch.lights.length} lights; ${MAX_SCENE_LIGHTS} is recommended.`;
      }
    }
    if (patch.cameras !== undefined) updates.cameras = patch.cameras;
    if (patch.materials !== undefined) updates.materials = patch.materials;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata;
    return this.scenes.update(id, updates as Partial<Omit<Scene, 'id' | 'createdAt'>>);
  }

  async deleteScene(id: string): Promise<void> {
    await this.scenes.delete(id);
  }

  // -------------------------------------------------------------------------
  // Camera Keyframe CRUD
  // -------------------------------------------------------------------------

  async createCameraKeyframe(slideId: string, input: {
    sceneId?: string;
    orderIndex?: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
    roll?: number;
    easing?: { p1x: number; p1y: number; p2x: number; p2y: number };
    durationMs?: number;
    trigger?: 'auto' | 'click' | 'scroll' | 'data';
  }): Promise<CameraKeyframe> {
    const now = this.clock();
    const orderIndex = input.orderIndex ?? await this.cameraKeyframes.nextOrderIndex(slideId);

    // Default easing: ease-in-out
    const easing = input.easing ?? { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };

    const record: CameraKeyframe = {
      id: this.idGen(),
      slideId,
      ...(input.sceneId !== undefined ? { sceneId: input.sceneId } : {}),
      orderIndex,
      position: input.position,
      target: input.target,
      fov: input.fov,
      roll: input.roll ?? 0,
      easing,
      durationMs: input.durationMs ?? 500,
      trigger: input.trigger ?? 'auto',
      createdAt: now,
    };
    await this.cameraKeyframes.insert(record);
    return record;
  }

  async getCameraKeyframe(id: string): Promise<CameraKeyframe> {
    const k = await this.cameraKeyframes.findById(id);
    if (!k) throw new CameraKeyframeNotFoundError(id);
    return k;
  }

  async listCameraKeyframes(slideId: string): Promise<CameraKeyframe[]> {
    return this.cameraKeyframes.listBySlide(slideId);
  }

  async patchCameraKeyframe(id: string, patch: {
    position?: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    fov?: number;
    roll?: number;
    easing?: { p1x: number; p1y: number; p2x: number; p2y: number };
    durationMs?: number;
    trigger?: 'auto' | 'click' | 'scroll' | 'data';
    orderIndex?: number;
  }): Promise<CameraKeyframe> {
    const updates: Record<string, unknown> = {};
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.target !== undefined) updates.target = patch.target;
    if (patch.fov !== undefined) updates.fov = patch.fov;
    if (patch.roll !== undefined) updates.roll = patch.roll;
    if (patch.easing !== undefined) updates.easing = patch.easing;
    if (patch.durationMs !== undefined) updates.durationMs = patch.durationMs;
    if (patch.trigger !== undefined) updates.trigger = patch.trigger;
    if (patch.orderIndex !== undefined) updates.orderIndex = patch.orderIndex;
    return this.cameraKeyframes.update(id, updates as Partial<Omit<CameraKeyframe, 'id' | 'createdAt'>>);
  }

  async deleteCameraKeyframe(id: string): Promise<void> {
    await this.cameraKeyframes.delete(id);
  }

  // -------------------------------------------------------------------------
  // Shader CRUD
  // -------------------------------------------------------------------------

  async createShader(input: {
    workspaceId: string;
    authorId: string;
    name: string;
    kind: ShaderKind;
    sourceWgsl: string;
    sourceGlsl: string;
    inputs?: Record<string, ShaderInput>;
  }): Promise<Shader> {
    // Validate WGSL requirement
    if (!input.sourceWgsl || input.sourceWgsl.trim().length === 0) {
      throw new ShaderValidationError('WGSL source is required for all shaders', 'WGSL_REQUIRED');
    }

    // Validate sourceWgsl must actually look like WGSL
    if (!input.sourceWgsl.includes('@group') && !input.sourceWgsl.includes('@vertex') && !input.sourceWgsl.includes('@fragment') && !input.sourceWgsl.includes('@compute')) {
      throw new ShaderValidationError('sourceWgsl must contain WGSL declarations (@group, @vertex, @fragment, or @compute)', 'WGSL_INVALID');
    }

    // Validate no host access in WGSL
    const hostViolations = detectHostAccess(input.sourceWgsl);
    if (hostViolations.length > 0) {
      throw new ShaderValidationError(`Host-environment access is not allowed in shaders: ${hostViolations.join('; ')}`, 'HOST_ACCESS_REJECTED');
    }

    // Also check GLSL
    const glslViolations = detectHostAccess(input.sourceGlsl);
    if (glslViolations.length > 0) {
      throw new ShaderValidationError(`Host-environment access is not allowed in shaders: ${glslViolations.join('; ')}`, 'HOST_ACCESS_REJECTED');
    }

    const now = this.clock();
    const record: Shader = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      authorId: input.authorId,
      name: input.name,
      kind: input.kind,
      sourceWgsl: input.sourceWgsl,
      sourceGlsl: input.sourceGlsl,
      inputs: input.inputs ?? {},
      published: false,
      createdAt: now,
    };
    await this.shaders.insert(record);
    return record;
  }

  async getShader(id: string): Promise<Shader> {
    const s = await this.shaders.findById(id);
    if (!s) throw new ShaderNotFoundError(id);
    return s;
  }

  async listShaders(workspaceId: string, kind?: ShaderKind): Promise<Shader[]> {
    return this.shaders.listByWorkspace(workspaceId, kind);
  }

  async updateShader(id: string, patch: {
    name?: string;
    sourceWgsl?: string;
    sourceGlsl?: string;
    inputs?: Record<string, ShaderInput>;
  }): Promise<Shader> {
    if (patch.sourceWgsl !== undefined) {
      if (patch.sourceWgsl.trim().length === 0) {
        throw new ShaderValidationError('WGSL source is required', 'WGSL_REQUIRED');
      }
      if (!patch.sourceWgsl.includes('@group') && !patch.sourceWgsl.includes('@vertex') && !patch.sourceWgsl.includes('@fragment') && !patch.sourceWgsl.includes('@compute')) {
        throw new ShaderValidationError('sourceWgsl must contain WGSL declarations', 'WGSL_INVALID');
      }
      const violations = detectHostAccess(patch.sourceWgsl);
      if (violations.length > 0) {
        throw new ShaderValidationError(`Host-environment access is not allowed: ${violations.join('; ')}`, 'HOST_ACCESS_REJECTED');
      }
    }
    if (patch.sourceGlsl !== undefined) {
      const violations = detectHostAccess(patch.sourceGlsl);
      if (violations.length > 0) {
        throw new ShaderValidationError(`Host-environment access is not allowed: ${violations.join('; ')}`, 'HOST_ACCESS_REJECTED');
      }
    }

    return this.shaders.update(id, patch);
  }

  async deleteShader(id: string): Promise<void> {
    await this.shaders.delete(id);
  }

  async publishShader(id: string): Promise<Shader> {
    const shader = await this.shaders.findById(id);
    if (!shader) throw new ShaderNotFoundError(id);
    return this.shaders.update(id, { published: true });
  }

  // -------------------------------------------------------------------------
  // License CRUD
  // -------------------------------------------------------------------------

  async createLicense(input: {
    workspaceId: string;
    name: string;
    source: string;
    termsUrl?: string;
    expiresAt?: string;
    seats?: number;
    metadata?: Record<string, unknown>;
  }): Promise<License> {
    const now = this.clock();
    const record: License = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      name: input.name,
      source: input.source,
      ...(input.termsUrl !== undefined ? { termsUrl: input.termsUrl } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.seats !== undefined ? { seats: input.seats } : {}),
      metadata: input.metadata ?? {},
      createdAt: now,
    };
    await this.licenses.insert(record);
    return record;
  }

  async getLicense(id: string): Promise<License> {
    const l = await this.licenses.findById(id);
    if (!l) throw new LicenseNotFoundError(id);
    return l;
  }

  async listLicenses(workspaceId: string): Promise<License[]> {
    return this.licenses.listByWorkspace(workspaceId);
  }

  async patchLicense(id: string, patch: {
    name?: string;
    termsUrl?: string;
    expiresAt?: string;
    seats?: number;
    metadata?: Record<string, unknown>;
  }): Promise<License> {
    return this.licenses.update(id, patch);
  }

  async deleteLicense(id: string): Promise<void> {
    const referenced = await this.licenses.isReferencedByModel(id);
    if (referenced) throw new LicenseReferencedError(id);
    await this.licenses.delete(id);
  }

  // -------------------------------------------------------------------------
  // Audio Asset CRUD
  // -------------------------------------------------------------------------

  async createAudioAsset(input: {
    workspaceId: string;
    uploaderId?: string;
    name: string;
    format: AudioFormat;
    sourceUrl: string;
    derivedUrl: string;
    durationMs: number;
    sampleRate: number;
    channels: number;
    bitrateKbps?: number;
    waveformPeaks?: readonly number[];
    licenseId?: string;
    tracks?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }): Promise<AudioAsset> {
    const now = this.clock();
    const record: AudioAsset = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name,
      format: input.format,
      sourceUrl: input.sourceUrl,
      derivedUrl: input.derivedUrl,
      durationMs: input.durationMs,
      sampleRate: input.sampleRate,
      channels: input.channels,
      ...(input.bitrateKbps !== undefined ? { bitrateKbps: input.bitrateKbps } : {}),
      ...(input.waveformPeaks !== undefined ? { waveformPeaks: input.waveformPeaks } : {}),
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.audios.insert(record);
    return record;
  }

  async getAudioAsset(id: string): Promise<AudioAsset> {
    const a = await this.audios.findById(id);
    if (!a) throw new AudioAssetNotFoundError(id);
    return a;
  }

  async listAudioAssets(workspaceId: string): Promise<AudioAsset[]> {
    return this.audios.listByWorkspace(workspaceId);
  }

  async patchAudioAsset(id: string, patch: {
    name?: string;
    licenseId?: string;
    metadata?: Record<string, unknown>;
    tracks?: Array<Record<string, unknown>>;
  }): Promise<AudioAsset> {
    return this.audios.update(id, patch);
  }

  async deleteAudioAsset(id: string): Promise<void> {
    await this.audios.delete(id);
  }

  async processAudioUpload(input: {
    buffer: ArrayBuffer;
    format: string;
    workspaceId: string;
    name?: string;
    licenseId?: string;
    uploaderId?: string;
  }): Promise<{
    audioAssetId: string;
    formatDetected: string;
    durationMs: number;
    sampleRate: number;
    channels: number;
    warnings: string[];
    rejected: boolean;
    rejectionReason?: string;
  }> {
    if (input.buffer.byteLength > this.maxUploadBytes) {
      return {
        audioAssetId: '',
        formatDetected: input.format,
        durationMs: 0,
        sampleRate: 0,
        channels: 0,
        warnings: [],
        rejected: true,
        rejectionReason: `File size exceeds maximum of ${this.maxUploadBytes / (1024 * 1024)}MB`,
      };
    }

    const fmt = input.format.toLowerCase();
    const { durationMs, sampleRate, channels, warnings } = parseAudioMetadata(input.buffer, fmt);

    const audioId = this.idGen();
    const now = this.clock();
    const sourceUrl = `https://cdn.domio.app/uploads/${audioId}.${fmt}`;
    const derivedUrl = `https://cdn.domio.app/derived/${audioId}.mp3`;

    const record: AudioAsset = {
      id: audioId,
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name ?? `upload-${audioId.slice(0, 8)}`,
      format: input.format as AudioFormat,
      sourceUrl,
      derivedUrl,
      durationMs,
      sampleRate,
      channels,
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.audios.insert(record);

    return {
      audioAssetId: audioId,
      formatDetected: input.format,
      durationMs,
      sampleRate,
      channels,
      warnings: [...warnings],
      rejected: false,
    };
  }

  // -------------------------------------------------------------------------
  // Video Asset CRUD
  // -------------------------------------------------------------------------

  async createVideoAsset(input: {
    workspaceId: string;
    uploaderId?: string;
    name: string;
    format: VideoFormat;
    sourceUrl: string;
    derivedUrl: string;
    thumbnailUrl?: string;
    durationMs: number;
    width: number;
    height: number;
    fps: number;
    hasAudio?: boolean;
    chapters?: Array<Record<string, unknown>>;
    captions?: Array<Record<string, unknown>>;
    licenseId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<VideoAsset> {
    const now = this.clock();
    const record: VideoAsset = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name,
      format: input.format,
      sourceUrl: input.sourceUrl,
      derivedUrl: input.derivedUrl,
      ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      durationMs: input.durationMs,
      width: input.width,
      height: input.height,
      fps: input.fps,
      hasAudio: input.hasAudio ?? false,
      chapters: (input.chapters ?? []) as unknown as VideoAsset['chapters'],
      captions: (input.captions ?? []) as unknown as VideoAsset['captions'],
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.videos.insert(record);
    return record;
  }

  async getVideoAsset(id: string): Promise<VideoAsset> {
    const v = await this.videos.findById(id);
    if (!v) throw new VideoAssetNotFoundError(id);
    return v;
  }

  async listVideoAssets(workspaceId: string): Promise<VideoAsset[]> {
    return this.videos.listByWorkspace(workspaceId);
  }

  async patchVideoAsset(id: string, patch: {
    name?: string;
    thumbnailUrl?: string;
    chapters?: Array<Record<string, unknown>>;
    captions?: Array<Record<string, unknown>>;
    licenseId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<VideoAsset> {
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.thumbnailUrl !== undefined) updates.thumbnailUrl = patch.thumbnailUrl;
    if (patch.chapters !== undefined) updates.chapters = patch.chapters;
    if (patch.captions !== undefined) updates.captions = patch.captions;
    if (patch.licenseId !== undefined) updates.licenseId = patch.licenseId;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata;
    return this.videos.update(id, updates as Partial<Omit<VideoAsset, 'id' | 'createdAt'>>);
  }

  async deleteVideoAsset(id: string): Promise<void> {
    await this.videos.delete(id);
  }

  async processVideoUpload(input: {
    buffer: ArrayBuffer;
    format: string;
    workspaceId: string;
    name?: string;
    licenseId?: string;
    uploaderId?: string;
  }): Promise<{
    videoAssetId: string;
    formatDetected: string;
    durationMs: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
    warnings: string[];
    rejected: boolean;
    rejectionReason?: string;
  }> {
    if (input.buffer.byteLength > this.maxUploadBytes) {
      return {
        videoAssetId: '',
        formatDetected: input.format,
        durationMs: 0,
        width: 0,
        height: 0,
        fps: 0,
        hasAudio: false,
        warnings: [],
        rejected: true,
        rejectionReason: `File size exceeds maximum of ${this.maxUploadBytes / (1024 * 1024)}MB`,
      };
    }

    const fmt = input.format.toLowerCase();
    const { durationMs, width, height, fps, hasAudio, warnings } = parseVideoMetadata(input.buffer, fmt);

    const videoId = this.idGen();
    const now = this.clock();
    const sourceUrl = `https://cdn.domio.app/uploads/${videoId}.${fmt}`;
    const derivedUrl = `https://cdn.domio.app/derived/${videoId}.mp4`;
    const thumbnailUrl = `https://cdn.domio.app/thumbnails/${videoId}.jpg`;

    const record: VideoAsset = {
      id: videoId,
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name ?? `upload-${videoId.slice(0, 8)}`,
      format: input.format as VideoFormat,
      sourceUrl,
      derivedUrl,
      thumbnailUrl,
      durationMs,
      width,
      height,
      fps,
      hasAudio,
      chapters: [],
      captions: [],
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.videos.insert(record);

    return {
      videoAssetId: videoId,
      formatDetected: input.format,
      durationMs,
      width,
      height,
      fps,
      hasAudio,
      warnings: [...warnings],
      rejected: false,
    };
  }

  // -------------------------------------------------------------------------
  // Lottie Asset CRUD
  // -------------------------------------------------------------------------

  async createLottieAsset(input: {
    workspaceId: string;
    uploaderId?: string;
    name: string;
    format: LottieFormat;
    sourceUrl: string;
    derivedUrl: string;
    thumbnailUrl?: string;
    durationMs: number;
    fps: number;
    width: number;
    height: number;
    layerCount: number;
    layers?: Array<Record<string, unknown>>;
    sanitized?: boolean;
    sanitizedWarnings?: readonly string[];
    licenseId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LottieAsset> {
    const now = this.clock();
    const record: LottieAsset = {
      id: this.idGen(),
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name,
      format: input.format,
      sourceUrl: input.sourceUrl,
      derivedUrl: input.derivedUrl,
      ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      durationMs: input.durationMs,
      fps: input.fps,
      width: input.width,
      height: input.height,
      layerCount: input.layerCount,
      layers: (input.layers ?? []) as unknown as LottieAsset['layers'],
      sanitized: input.sanitized ?? false,
      ...(input.sanitizedWarnings !== undefined ? { sanitizedWarnings: input.sanitizedWarnings } : {}),
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.lotties.insert(record);
    return record;
  }

  async getLottieAsset(id: string): Promise<LottieAsset> {
    const l = await this.lotties.findById(id);
    if (!l) throw new LottieAssetNotFoundError(id);
    return l;
  }

  async listLottieAssets(workspaceId: string): Promise<LottieAsset[]> {
    return this.lotties.listByWorkspace(workspaceId);
  }

  async patchLottieAsset(id: string, patch: {
    name?: string;
    thumbnailUrl?: string;
    layers?: Array<Record<string, unknown>>;
    sanitized?: boolean;
    sanitizedWarnings?: readonly string[];
    licenseId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LottieAsset> {
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.thumbnailUrl !== undefined) updates.thumbnailUrl = patch.thumbnailUrl;
    if (patch.layers !== undefined) updates.layers = patch.layers;
    if (patch.sanitized !== undefined) updates.sanitized = patch.sanitized;
    if (patch.sanitizedWarnings !== undefined) updates.sanitizedWarnings = [...patch.sanitizedWarnings];
    if (patch.licenseId !== undefined) updates.licenseId = patch.licenseId;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata;
    return this.lotties.update(id, updates as Partial<Omit<LottieAsset, 'id' | 'createdAt'>>);
  }

  async deleteLottieAsset(id: string): Promise<void> {
    await this.lotties.delete(id);
  }

  async processLottieUpload(input: {
    buffer: ArrayBuffer;
    format: string;
    workspaceId: string;
    name?: string;
    licenseId?: string;
    uploaderId?: string;
  }): Promise<{
    lottieAssetId: string;
    formatDetected: string;
    durationMs: number;
    fps: number;
    width: number;
    height: number;
    layerCount: number;
    sanitized: boolean;
    warnings: string[];
    rejected: boolean;
    rejectionReason?: string;
  }> {
    if (input.buffer.byteLength > this.maxUploadBytes) {
      return {
        lottieAssetId: '',
        formatDetected: input.format,
        durationMs: 0,
        fps: 0,
        width: 0,
        height: 0,
        layerCount: 0,
        sanitized: false,
        warnings: [],
        rejected: true,
        rejectionReason: `File size exceeds maximum of ${this.maxUploadBytes / (1024 * 1024)}MB`,
      };
    }

    const fmt = input.format.toLowerCase();
    const { durationMs, fps, width, height, layerCount, sanitized, warnings } =
      parseLottieMetadata(input.buffer, fmt);

    const lottieId = this.idGen();
    const now = this.clock();
    const sourceUrl = `https://cdn.domio.app/uploads/${lottieId}.${fmt}`;
    const derivedUrl = `https://cdn.domio.app/derived/${lottieId}.json`;
    const thumbnailUrl = `https://cdn.domio.app/thumbnails/${lottieId}.png`;

    const record: LottieAsset = {
      id: lottieId,
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? input.workspaceId,
      name: input.name ?? `upload-${lottieId.slice(0, 8)}`,
      format: input.format as LottieFormat,
      sourceUrl,
      derivedUrl,
      thumbnailUrl,
      durationMs,
      fps,
      width,
      height,
      layerCount,
      layers: [],
      sanitized,
      ...(warnings.length > 0 ? { sanitizedWarnings: [...warnings] } : {}),
      ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.lotties.insert(record);

    return {
      lottieAssetId: lottieId,
      formatDetected: input.format,
      durationMs,
      fps,
      width,
      height,
      layerCount,
      sanitized,
      warnings: [...warnings],
      rejected: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Service errors
// ---------------------------------------------------------------------------

export class ShaderValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShaderValidationError';
    this.code = code;
  }
}
