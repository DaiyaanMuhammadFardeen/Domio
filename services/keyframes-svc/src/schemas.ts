/**
 * Phase 11 camera keyframe — Ajv draft-2020-12 schema validation.
 *
 * Validates request bodies against contracts/schema/v1/camera-keyframe-v1.schema.json
 * shapes. Returns 400 with ajv error details on mismatch.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject } from 'ajv';

// ---------------------------------------------------------------------------
// Ajv instance (draft-2020-12, allErrors, formats)
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// ---------------------------------------------------------------------------
// Schema: CreateCameraKeyframeRequest (mirrors OpenAPI components)
// ---------------------------------------------------------------------------

const vec3Schema = {
  type: 'object' as const,
  required: ['x', 'y', 'z'],
  additionalProperties: false,
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' },
  },
};

const bezierEasingSchema = {
  type: 'object' as const,
  required: ['p1x', 'p1y', 'p2x', 'p2y'],
  additionalProperties: false,
  properties: {
    p1x: { type: 'number', minimum: 0, maximum: 1 },
    p1y: { type: 'number' },
    p2x: { type: 'number', minimum: 0, maximum: 1 },
    p2y: { type: 'number' },
  },
};

const createSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
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

const patchSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
  additionalProperties: false,
  minProperties: 1,
  properties: {
    position: {
      type: 'object' as const,
      additionalProperties: false,
      properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
    },
    target: {
      type: 'object' as const,
      additionalProperties: false,
      properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
    },
    fov: { type: 'number', minimum: 1, maximum: 179 },
    roll: { type: 'number' },
    easing: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        p1x: { type: 'number', minimum: 0, maximum: 1 },
        p1y: { type: 'number' },
        p2x: { type: 'number', minimum: 0, maximum: 1 },
        p2y: { type: 'number' },
      },
    },
    durationMs: { type: 'integer', minimum: 0 },
    trigger: { type: 'string', enum: ['auto', 'click', 'scroll', 'data'] },
    orderIndex: { type: 'integer', minimum: 0 },
  },
};

const interpolateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
  required: ['keyframes', 'time_ms'],
  additionalProperties: false,
  properties: {
    keyframes: {
      type: 'array' as const,
      minItems: 1,
      items: { type: 'object' as const },
    },
    time_ms: { type: 'number', minimum: 0 },
  },
};

const batchSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
  required: ['keyframes'],
  additionalProperties: false,
  properties: {
    keyframes: {
      type: 'array' as const,
      minItems: 1,
      items: { type: 'object' as const },
    },
  },
};

// ---------------------------------------------------------------------------
// Compiled validators
// ---------------------------------------------------------------------------

const validateCreateFn = ajv.compile(createSchema);
const validatePatchFn = ajv.compile(patchSchema);
const validateInterpolateFn = ajv.compile(interpolateSchema);
const validateBatchFn = ajv.compile(batchSchema);

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
}

export function validateCreateKeyframe(body: unknown): ValidationResult {
  const valid = validateCreateFn(body) as boolean;
  return { valid, errors: valid ? [] : (validateCreateFn.errors ?? []) };
}

export function validatePatchKeyframe(body: unknown): ValidationResult {
  const valid = validatePatchFn(body) as boolean;
  return { valid, errors: valid ? [] : (validatePatchFn.errors ?? []) };
}

export function validateInterpolateBody(body: unknown): ValidationResult {
  const valid = validateInterpolateFn(body) as boolean;
  return { valid, errors: valid ? [] : (validateInterpolateFn.errors ?? []) };
}

export function validateBatchBody(body: unknown): ValidationResult {
  const valid = validateBatchFn(body) as boolean;
  return { valid, errors: valid ? [] : (validateBatchFn.errors ?? []) };
}

// ---------------------------------------------------------------------------
// Easing business-rule validation (monotonicity)
// ---------------------------------------------------------------------------

export interface EasingValidationError {
  readonly message: string;
  readonly code: string;
}

export function validateEasingMonotonicity(easing: {
  readonly p1x: number;
  readonly p2x: number;
}): EasingValidationError[] {
  const errors: EasingValidationError[] = [];
  if (easing.p1x > easing.p2x) {
    errors.push({
      message: `Non-monotonic easing: p1x (${easing.p1x}) must be <= p2x (${easing.p2x})`,
      code: 'NON_MONOTONIC_EASING',
    });
  }
  return errors;
}
