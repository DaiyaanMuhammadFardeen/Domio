/**
 * Shader Registry — request body validation (Phase 11).
 *
 * Uses ajv with draft-00 (2020-12) + ajv-formats for date-time support.
 * Validates CreateShaderRequest and UpdateShaderRequest bodies against
 * the contract schemas.
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
  readonly keyword: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

// ---------------------------------------------------------------------------
// CreateShaderRequest schema
// ---------------------------------------------------------------------------

const createShaderSchema = {
  type: 'object',
  required: ['name', 'kind', 'sourceWgsl', 'sourceGlsl'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    kind: { type: 'string', enum: ['background', 'particle', 'material', 'post'] },
    sourceWgsl: { type: 'string' },
    sourceGlsl: { type: 'string' },
    inputs: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['float', 'vec2', 'vec3', 'vec4', 'mat4', 'texture2d', 'sampler'] },
          default: {},
          description: { type: 'string' },
        },
      },
    },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// UpdateShaderRequest schema
// ---------------------------------------------------------------------------

const updateShaderSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    sourceWgsl: { type: 'string', minLength: 1 },
    sourceGlsl: { type: 'string', minLength: 1 },
    inputs: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['float', 'vec2', 'vec3', 'vec4', 'mat4', 'texture2d', 'sampler'] },
          default: {},
          description: { type: 'string' },
        },
      },
    },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Compiled validators
// ---------------------------------------------------------------------------

const validateCreate = ajv.compile(createShaderSchema);
const validateUpdate = ajv.compile(updateShaderSchema);

type AjvError = { instancePath: string; message?: string; keyword: string };

function toValidationResult(valid: boolean, errors: AjvError[] | null | undefined): ValidationResult {
  if (valid || !errors) return { valid: true, errors: [] };
  const mapped: ValidationError[] = errors.map((e: AjvError) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'Unknown error',
    keyword: e.keyword,
  }));
  return { valid: false, errors: mapped };
}

export function validateCreateShader(body: unknown): ValidationResult {
  const valid = validateCreate(body);
  return toValidationResult(valid, validateCreate.errors);
}

export function validateUpdateShader(body: unknown): ValidationResult {
  const valid = validateUpdate(body);
  return toValidationResult(valid, validateUpdate.errors);
}

// ---------------------------------------------------------------------------
// Host-environment access patterns
// ---------------------------------------------------------------------------

const HOST_ACCESS_PATTERNS = [
  'fetch(',
  'XMLHttpRequest',
  'importScripts',
  'process.',
];

/**
 * Check if source code contains host-environment access patterns
 * that are not allowed in shaders.
 */
export function containsHostAccess(source: string): boolean {
  return HOST_ACCESS_PATTERNS.some(pattern => source.includes(pattern));
}

// ---------------------------------------------------------------------------
// Extension detection
// ---------------------------------------------------------------------------

export interface ExtensionDetection {
  readonly extensions: string[];
  readonly unsupported: string[];
}

// Extensions known to be supported in our environment
const KNOWN_SUPPORTED = new Set([
  'GL_EXT_shader_texture_lod',
  'GL_OES_standard_derivatives',
  'GL_ARB_draw_buffers',
]);

/**
 * Scan shader source for extension directives.
 * Detects both WGSL `requires_` directives and GLSL `#extension` directives.
 */
export function detectExtensions(source: string): ExtensionDetection {
  const extensions: string[] = [];

  // GLSL: #extension GL_EXT_foo : enable
  const glslExtRe = /#extension\s+(GL_\w+)/g;
  let m = glslExtRe.exec(source);
  while (m) {
    extensions.push(m[1]!);
    m = glslExtRe.exec(source);
  }

  // WGSL: requires something via `enable` or custom `requires_` pattern
  const wgslRe = /requires_\w+:(\w+)/g;
  let w = wgslRe.exec(source);
  while (w) {
    extensions.push(w[1]!);
    w = wgslRe.exec(source);
  }

  const unsupported = extensions.filter(ext => !KNOWN_SUPPORTED.has(ext));
  return { extensions, unsupported };
}
