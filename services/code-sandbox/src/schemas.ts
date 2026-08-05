/**
 * Code Sandbox — request validation schemas (ajv).
 *
 * Validates create/update policy requests and run requests against the
 * contract schemas (code-sandbox-policy-v1.schema.json, sandbox-policies.yaml,
 * sandbox-runs.yaml).
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ---------------------------------------------------------------------------
// Create sandbox policy
// ---------------------------------------------------------------------------

const createPolicySchema = {
  type: 'object',
  required: ['workspaceId', 'name'],
  additionalProperties: false,
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    maxCpuMs: { type: 'integer', minimum: 100, maximum: 30000, default: 8000 },
    maxMemoryMb: { type: 'integer', minimum: 8, maximum: 512, default: 64 },
    allowNetwork: { type: 'boolean', default: false },
    allowDom: { type: 'boolean', default: false },
    allowConsole: { type: 'boolean', default: true },
    allowImport: { type: 'boolean', default: false },
    moduleAllowlist: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      default: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Update sandbox policy (partial)
// ---------------------------------------------------------------------------

const updatePolicySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 256 },
    maxCpuMs: { type: 'integer', minimum: 100, maximum: 30000 },
    maxMemoryMb: { type: 'integer', minimum: 8, maximum: 512 },
    allowNetwork: { type: 'boolean' },
    allowDom: { type: 'boolean' },
    allowConsole: { type: 'boolean' },
    allowImport: { type: 'boolean' },
    moduleAllowlist: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
};

// ---------------------------------------------------------------------------
// Sandbox run request
// ---------------------------------------------------------------------------

const sandboxRunSchema = {
  type: 'object',
  required: ['policyId', 'code'],
  additionalProperties: false,
  properties: {
    policyId: { type: 'string', minLength: 1 },
    code: { type: 'string', maxLength: 65536 },
    language: { type: 'string', enum: ['js'], default: 'js' },
  },
};

// ---------------------------------------------------------------------------
// Compiled validators
// ---------------------------------------------------------------------------

const validateCreate = ajv.compile(createPolicySchema);
const validateUpdate = ajv.compile(updatePolicySchema);
const validateRun = ajv.compile(sandboxRunSchema);

// ---------------------------------------------------------------------------
// Public validation functions
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

function runValidate(validateFn: ReturnType<typeof ajv.compile>, data: unknown): ValidationResult {
  const valid = validateFn(data);
  if (valid) return { valid: true, errors: [] };
  const errors: ValidationError[] = (validateFn.errors ?? []).map((e) => ({
    path: e.instancePath || (e.params as Record<string, string>)?.missingProperty || '',
    message: e.message ?? 'Unknown error',
    code: e.keyword ?? 'UNKNOWN',
  }));
  return { valid: false, errors };
}

export function validateCreatePolicy(body: unknown): ValidationResult {
  return runValidate(validateCreate, body);
}

export function validateUpdatePolicy(body: unknown): ValidationResult {
  return runValidate(validateUpdate, body);
}

export function validateSandboxRun(body: unknown): ValidationResult {
  return runValidate(validateRun, body);
}
