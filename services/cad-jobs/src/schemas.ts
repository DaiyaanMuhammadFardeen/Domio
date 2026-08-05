/**
 * @domio/cad-jobs — Ajv draft-2020-12 schema validation.
 *
 * Validates create-job request bodies against the OpenAPI contract at
 * contracts/openapi/v1/cad-jobs.yaml.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject } from 'ajv';
import { MIN_TARGET_POLY_COUNT, MAX_TARGET_POLY_COUNT } from './types.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const createCadJobSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object' as const,
  required: ['modelAssetId'],
  additionalProperties: false,
  properties: {
    modelAssetId: { type: 'string', minLength: 1 },
    tessellationChordMm: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
    tessellationAngleDeg: { type: 'number', minimum: 0, maximum: 90 },
    targetPolyCount: {
      type: 'integer',
      minimum: MIN_TARGET_POLY_COUNT,
      maximum: MAX_TARGET_POLY_COUNT,
    },
    format: { type: 'string', enum: ['glb', 'gltf'] },
  },
};

const validateCreateFn = ajv.compile(createCadJobSchema);

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
}

export function validateCreateCadJob(body: unknown): ValidationResult {
  const valid = validateCreateFn(body) as boolean;
  return { valid, errors: valid ? [] : (validateCreateFn.errors ?? []) };
}