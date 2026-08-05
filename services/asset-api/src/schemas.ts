/**
 * Asset API — JSON Schema validation (Phase 11).
 *
 * Uses ajv with draft2020-12 + ajv-formats to validate request bodies
 * against the contracts/schema/v1 JSON schemas. Returns structured
 * validation errors for 400 responses.
 *
 * Coverage: models, scenes, camera keyframes, shaders, licenses,
 * audio assets, video assets, lottie assets.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

// ---------------------------------------------------------------------------
// Common schema fragments
// ---------------------------------------------------------------------------

const vec3Schema = {
  type: 'object',
  required: ['x', 'y', 'z'],
  additionalProperties: false,
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' },
  },
};

const bezierEasingSchema = {
  type: 'object',
  required: ['p1x', 'p1y', 'p2x', 'p2y'],
  additionalProperties: false,
  properties: {
    p1x: { type: 'number', minimum: 0, maximum: 1 },
    p1y: { type: 'number' },
    p2x: { type: 'number', minimum: 0, maximum: 1 },
    p2y: { type: 'number' },
  },
};

// ---------------------------------------------------------------------------
// Model Asset schemas
// ---------------------------------------------------------------------------

const createModelSchema = {
  type: 'object',
  required: ['workspaceId', 'name', 'format', 'sourceUrl', 'derivedUrl'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    uploaderId: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    format: { type: 'string', enum: ['glb', 'gltf', 'usdz', 'step', 'stp', 'iges', 'igs', 'fbx', 'obj'] },
    sourceUrl: { type: 'string', format: 'uri' },
    derivedUrl: { type: 'string', format: 'uri' },
    thumbnailUrl: { type: 'string', format: 'uri' },
    polyCount: { type: 'integer', minimum: 0 },
    textureCount: { type: 'integer', minimum: 0 },
    hasAnimations: { type: 'boolean' },
    cadSourceUrl: { type: 'string', format: 'uri' },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
  },
};

const patchModelSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
    thumbnailUrl: { type: 'string', format: 'uri' },
  },
};

// ---------------------------------------------------------------------------
// Scene schemas
// ---------------------------------------------------------------------------

const lightSchema = {
  type: 'object',
  required: ['kind', 'color', 'intensity'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['directional', 'point', 'spot'] },
    position: vec3Schema,
    target: vec3Schema,
    color: { type: 'string' },
    intensity: { type: 'number', minimum: 0, maximum: 10 },
    castShadow: { type: 'boolean' },
    spotAngle: { type: 'number', minimum: 0, maximum: 180 },
  },
};

const cameraPresetSchema = {
  type: 'object',
  required: ['name', 'position', 'target', 'fov'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    position: vec3Schema,
    target: vec3Schema,
    fov: { type: 'number', minimum: 1, maximum: 179 },
    roll: { type: 'number' },
  },
};

const pbrMaterialSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    baseColor: { type: 'string' },
    roughness: { type: 'number', minimum: 0, maximum: 1 },
    metallic: { type: 'number', minimum: 0, maximum: 1 },
    normalMapUrl: { type: 'string' },
    emissiveColor: { type: 'string' },
    emissiveIntensity: { type: 'number', minimum: 0 },
    occlusionStrength: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const environmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    envMapUrls: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    exposure: { type: 'number', minimum: 0, maximum: 10 },
    rotationY: { type: 'number' },
  },
};

const createSceneSchema = {
  type: 'object',
  required: ['modelAssetId'],
  additionalProperties: false,
  properties: {
    modelAssetId: { type: 'string', minLength: 1 },
    environment: environmentSchema,
    lights: { type: 'array', items: lightSchema },
    cameras: { type: 'array', items: cameraPresetSchema },
    materials: { type: 'object', additionalProperties: pbrMaterialSchema },
    metadata: { type: 'object' },
  },
};

const patchSceneSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environment: environmentSchema,
    lights: { type: 'array', items: lightSchema },
    cameras: { type: 'array', items: cameraPresetSchema },
    materials: { type: 'object', additionalProperties: pbrMaterialSchema },
    metadata: { type: 'object' },
  },
};

// ---------------------------------------------------------------------------
// Camera Keyframe schemas
// ---------------------------------------------------------------------------

const createCameraKeyframeSchema = {
  type: 'object',
  required: ['position', 'target', 'fov'],
  additionalProperties: false,
  properties: {
    sceneId: { type: 'string' },
    orderIndex: { type: 'integer', minimum: 0 },
    position: vec3Schema,
    target: vec3Schema,
    fov: { type: 'number', minimum: 1, maximum: 179 },
    roll: { type: 'number' },
    easing: bezierEasingSchema,
    durationMs: { type: 'integer', minimum: 0 },
    trigger: { type: 'string', enum: ['auto', 'click', 'scroll', 'data'] },
  },
};

const patchCameraKeyframeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    position: vec3Schema,
    target: vec3Schema,
    fov: { type: 'number', minimum: 1, maximum: 179 },
    roll: { type: 'number' },
    easing: bezierEasingSchema,
    durationMs: { type: 'integer', minimum: 0 },
    trigger: { type: 'string', enum: ['auto', 'click', 'scroll', 'data'] },
    orderIndex: { type: 'integer', minimum: 0 },
  },
};

// ---------------------------------------------------------------------------
// Shader schemas
// ---------------------------------------------------------------------------

const createShaderSchema = {
  type: 'object',
  required: ['workspaceId', 'authorId', 'name', 'kind', 'sourceWgsl', 'sourceGlsl'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    authorId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    kind: { type: 'string', enum: ['background', 'particle', 'material', 'post'] },
    sourceWgsl: { type: 'string' },
    sourceGlsl: { type: 'string', minLength: 1 },
    inputs: { type: 'object' },
  },
};

const updateShaderSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    sourceWgsl: { type: 'string', minLength: 1 },
    sourceGlsl: { type: 'string', minLength: 1 },
    inputs: { type: 'object' },
  },
};

// ---------------------------------------------------------------------------
// License schemas
// ---------------------------------------------------------------------------

const createLicenseSchema = {
  type: 'object',
  required: ['workspaceId', 'name', 'source'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    source: { type: 'string', minLength: 1, maxLength: 128 },
    termsUrl: { type: 'string', format: 'uri' },
    expiresAt: { type: 'string', format: 'date-time' },
    seats: { type: 'integer', minimum: 1 },
    metadata: { type: 'object' },
  },
};

const patchLicenseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    termsUrl: { type: 'string', format: 'uri' },
    expiresAt: { type: 'string', format: 'date-time' },
    seats: { type: 'integer', minimum: 1 },
    metadata: { type: 'object' },
  },
};

// ---------------------------------------------------------------------------
// Audio Asset schemas
// ---------------------------------------------------------------------------

const audioTrackSchema = {
  type: 'object',
  required: ['id', 'kind', 'volume', 'pan', 'mute', 'durationMs'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['music', 'voiceover', 'sfx', 'ambient'] },
    volume: { type: 'number', minimum: 0, maximum: 2 },
    pan: { type: 'number', minimum: -1, maximum: 1 },
    mute: { type: 'boolean' },
    fadeInMs: { type: 'integer', minimum: 0 },
    fadeOutMs: { type: 'integer', minimum: 0 },
    startOffsetMs: { type: 'integer', minimum: 0 },
    durationMs: { type: 'integer', minimum: 0 },
  },
};

const createAudioAssetSchema = {
  type: 'object',
  required: ['workspaceId', 'name', 'format', 'sourceUrl', 'derivedUrl', 'durationMs', 'sampleRate', 'channels'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    uploaderId: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    format: { type: 'string', enum: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
    sourceUrl: { type: 'string', format: 'uri' },
    derivedUrl: { type: 'string', format: 'uri' },
    durationMs: { type: 'integer', minimum: 0 },
    sampleRate: { type: 'integer', minimum: 8000 },
    channels: { type: 'integer', minimum: 1, maximum: 8 },
    bitrateKbps: { type: 'integer', minimum: 0 },
    waveformPeaks: { type: 'array', items: { type: 'number' } },
    licenseId: { type: 'string' },
    tracks: { type: 'array', items: audioTrackSchema },
    metadata: { type: 'object' },
  },
};

const patchAudioAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
    tracks: { type: 'array', items: audioTrackSchema },
  },
};

// ---------------------------------------------------------------------------
// Video Asset schemas
// ---------------------------------------------------------------------------

const videoChapterSchema = {
  type: 'object',
  required: ['id', 'title', 'startMs', 'endMs'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1, maxLength: 256 },
    startMs: { type: 'integer', minimum: 0 },
    endMs: { type: 'integer', minimum: 0 },
  },
};

const videoCaptionTrackSchema = {
  type: 'object',
  required: ['id', 'language', 'label', 'vttUrl'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    language: { type: 'string', minLength: 2, maxLength: 16 },
    label: { type: 'string', minLength: 1, maxLength: 128 },
    vttUrl: { type: 'string', format: 'uri' },
    default: { type: 'boolean' },
  },
};

const createVideoAssetSchema = {
  type: 'object',
  required: ['workspaceId', 'name', 'format', 'sourceUrl', 'derivedUrl', 'durationMs', 'width', 'height', 'fps'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    uploaderId: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    format: { type: 'string', enum: ['mp4', 'webm', 'mov', 'mkv', 'avi'] },
    sourceUrl: { type: 'string', format: 'uri' },
    derivedUrl: { type: 'string', format: 'uri' },
    thumbnailUrl: { type: 'string', format: 'uri' },
    durationMs: { type: 'integer', minimum: 0 },
    width: { type: 'integer', minimum: 16 },
    height: { type: 'integer', minimum: 16 },
    fps: { type: 'number', minimum: 1, maximum: 240 },
    hasAudio: { type: 'boolean' },
    chapters: { type: 'array', items: videoChapterSchema },
    captions: { type: 'array', items: videoCaptionTrackSchema },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
  },
};

const patchVideoAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    thumbnailUrl: { type: 'string', format: 'uri' },
    chapters: { type: 'array', items: videoChapterSchema },
    captions: { type: 'array', items: videoCaptionTrackSchema },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
  },
};

// ---------------------------------------------------------------------------
// Lottie Asset schemas
// ---------------------------------------------------------------------------

const lottieLayerSchema = {
  type: 'object',
  required: ['name', 'type', 'visible', 'hasMasks', 'hasMatte'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'integer' },
    visible: { type: 'boolean' },
    hasMasks: { type: 'boolean' },
    hasMatte: { type: 'boolean' },
  },
};

const createLottieAssetSchema = {
  type: 'object',
  required: ['workspaceId', 'name', 'format', 'sourceUrl', 'derivedUrl', 'durationMs', 'fps', 'width', 'height', 'layerCount'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    uploaderId: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    format: { type: 'string', enum: ['json', 'bodymovin'] },
    sourceUrl: { type: 'string', format: 'uri' },
    derivedUrl: { type: 'string', format: 'uri' },
    thumbnailUrl: { type: 'string', format: 'uri' },
    durationMs: { type: 'integer', minimum: 0 },
    fps: { type: 'number', minimum: 1, maximum: 240 },
    width: { type: 'integer', minimum: 1 },
    height: { type: 'integer', minimum: 1 },
    layerCount: { type: 'integer', minimum: 1 },
    layers: { type: 'array', items: lottieLayerSchema },
    sanitized: { type: 'boolean' },
    sanitizedWarnings: { type: 'array', items: { type: 'string' } },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
  },
};

const patchLottieAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    thumbnailUrl: { type: 'string', format: 'uri' },
    layers: { type: 'array', items: lottieLayerSchema },
    sanitized: { type: 'boolean' },
    sanitizedWarnings: { type: 'array', items: { type: 'string' } },
    licenseId: { type: 'string' },
    metadata: { type: 'object' },
  },
};

// ---------------------------------------------------------------------------
// Compiled validators
// ---------------------------------------------------------------------------

const compiledCreateModel = ajv.compile(createModelSchema);
const compiledPatchModel = ajv.compile(patchModelSchema);
const compiledCreateScene = ajv.compile(createSceneSchema);
const compiledPatchScene = ajv.compile(patchSceneSchema);
const compiledCreateCameraKeyframe = ajv.compile(createCameraKeyframeSchema);
const compiledPatchCameraKeyframe = ajv.compile(patchCameraKeyframeSchema);
const compiledCreateShader = ajv.compile(createShaderSchema);
const compiledUpdateShader = ajv.compile(updateShaderSchema);
const compiledCreateLicense = ajv.compile(createLicenseSchema);
const compiledPatchLicense = ajv.compile(patchLicenseSchema);
const compiledCreateAudioAsset = ajv.compile(createAudioAssetSchema);
const compiledPatchAudioAsset = ajv.compile(patchAudioAssetSchema);
const compiledCreateVideoAsset = ajv.compile(createVideoAssetSchema);
const compiledPatchVideoAsset = ajv.compile(patchVideoAssetSchema);
const compiledCreateLottieAsset = ajv.compile(createLottieAssetSchema);
const compiledPatchLottieAsset = ajv.compile(patchLottieAssetSchema);

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

function runValidation(validate: (data: unknown) => boolean, body: unknown): ValidationResult {
  const valid = validate(body);
  if (valid) return { valid: true, errors: [] };
  const errs = (validate as unknown as { errors?: Array<{ instancePath?: string; message?: string; keyword?: string }> }).errors ?? [];
  const errors: ValidationError[] = errs.map(e => ({
    path: e.instancePath || '/',
    message: e.message ?? 'unknown error',
    code: e.keyword ?? 'UNKNOWN',
  }));
  return { valid: false, errors };
}

export function validateCreateModel(body: unknown): ValidationResult {
  return runValidation(compiledCreateModel, body);
}

export function validatePatchModel(body: unknown): ValidationResult {
  return runValidation(compiledPatchModel, body);
}

export function validateCreateScene(body: unknown): ValidationResult {
  return runValidation(compiledCreateScene, body);
}

export function validatePatchScene(body: unknown): ValidationResult {
  return runValidation(compiledPatchScene, body);
}

export function validateCreateCameraKeyframe(body: unknown): ValidationResult {
  return runValidation(compiledCreateCameraKeyframe, body);
}

export function validatePatchCameraKeyframe(body: unknown): ValidationResult {
  return runValidation(compiledPatchCameraKeyframe, body);
}

export function validateCreateShader(body: unknown): ValidationResult {
  return runValidation(compiledCreateShader, body);
}

export function validateUpdateShader(body: unknown): ValidationResult {
  return runValidation(compiledUpdateShader, body);
}

export function validateCreateLicense(body: unknown): ValidationResult {
  return runValidation(compiledCreateLicense, body);
}

export function validatePatchLicense(body: unknown): ValidationResult {
  return runValidation(compiledPatchLicense, body);
}

export function validateCreateAudioAsset(body: unknown): ValidationResult {
  return runValidation(compiledCreateAudioAsset, body);
}

export function validatePatchAudioAsset(body: unknown): ValidationResult {
  return runValidation(compiledPatchAudioAsset, body);
}

export function validateCreateVideoAsset(body: unknown): ValidationResult {
  return runValidation(compiledCreateVideoAsset, body);
}

export function validatePatchVideoAsset(body: unknown): ValidationResult {
  return runValidation(compiledPatchVideoAsset, body);
}

export function validateCreateLottieAsset(body: unknown): ValidationResult {
  return runValidation(compiledCreateLottieAsset, body);
}

export function validatePatchLottieAsset(body: unknown): ValidationResult {
  return runValidation(compiledPatchLottieAsset, body);
}
