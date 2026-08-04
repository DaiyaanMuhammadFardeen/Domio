/**
 * Timeline API — inline JSON-Schema 2020-12 validation (Phase 09).
 *
 * Schemas for every request body accepted by the REST surface.
 * If contracts/schema/v1/timeline-v1.schema.json etc. are available
 * at build time, those can be imported instead.  For now we define
 * them inline so the service is self-contained.
 *
 * Validation uses a lightweight custom validator — no external deps.
 */

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
// Minimal JSON-Schema validator
// ---------------------------------------------------------------------------

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validateType(value: unknown, expected: string): string | null {
  if (expected === 'array') {
    return Array.isArray(value) ? null : `Expected array, got ${typeOf(value)}`;
  }
  if (expected === 'object') {
    return (typeof value === 'object' && value !== null && !Array.isArray(value)) ? null : `Expected object, got ${typeOf(value)}`;
  }
  if (expected === 'integer') {
    return (typeof value === 'number' && Number.isInteger(value)) ? null : `Expected integer, got ${typeOf(value)}`;
  }
  return (typeof value === expected) ? null : `Expected ${expected}, got ${typeOf(value)}`;
}

function validateSchema(value: unknown, schema: SchemaDef, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Type check
  if (schema.type) {
    const typeErr = validateType(value, schema.type);
    if (typeErr) {
      errors.push({ path, message: typeErr, code: 'INVALID_TYPE' });
      return errors;
    }
  }

  // Enum
  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push({ path, message: `Value must be one of: ${schema.enum.join(', ')}`, code: 'INVALID_ENUM' });
  }

  // Number constraints
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `Value must be >= ${schema.minimum}`, code: 'BELOW_MINIMUM' });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `Value must be <= ${schema.maximum}`, code: 'ABOVE_MAXIMUM' });
    }
  }

  // String constraints
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `String length must be >= ${schema.minLength}`, code: 'TOO_SHORT' });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: `String length must be <= ${schema.maxLength}`, code: 'TOO_LONG' });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `String must match pattern: ${schema.pattern}`, code: 'PATTERN_MISMATCH' });
    }
  }

  // Array constraints
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `Array must have >= ${schema.minItems} items`, code: 'TOO_FEW_ITEMS' });
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateSchema(value[i], schema.items, `${path}[${i}]`));
      }
    }
  }

  // Object properties
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          errors.push({ path: `${path}.${key}`, message: `Required property "${key}" is missing`, code: 'REQUIRED' });
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], propSchema, `${path}.${key}`));
        }
      }
    }
  }

  // OneOf
  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter(sub => validateSchema(value, sub, path).length === 0).length;
    if (matchCount !== 1) {
      errors.push({ path, message: 'Value must match exactly one of the given schemas', code: 'ONE_OF_MISMATCH' });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

interface SchemaDef {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaDef>;
  items?: SchemaDef;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  oneOf?: SchemaDef[];
  additionalProperties?: boolean | SchemaDef;
}

const trackSchema: SchemaDef = {
  type: 'object',
  required: ['property', 'keyframes', 'easing'],
  properties: {
    property: { type: 'string', minLength: 1 },
    keyframes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['timeMs', 'value'],
        properties: {
          timeMs: { type: 'number', minimum: 0 },
          value: {},
          easing: { type: 'string' },
        },
      },
    },
    startOffsetMs: { type: 'number', minimum: 0 },
    easing: { type: 'string' },
  },
};

const triggerSchema: SchemaDef = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['on_click', 'on_enter', 'on_hover', 'on_data_change', 'on_timer'] },
    sourceId: { type: 'string' },
    fieldPath: { type: 'string' },
    offsetMs: { type: 'number' },
    debounceMs: { type: 'number', minimum: 0 },
  },
};

export const createTimelineSchema: SchemaDef = {
  type: 'object',
  required: ['slideId', 'elementId', 'durationMs'],
  properties: {
    deckId: { type: 'string', minLength: 1 },
    slideId: { type: 'string', minLength: 1 },
    elementId: { type: 'string', minLength: 1 },
    durationMs: { type: 'number', minimum: 0 },
    loop: { type: 'boolean' },
    playCount: { type: 'integer', minimum: 0 },
    startOffsetMs: { type: 'number', minimum: 0 },
    tracks: { type: 'array', items: trackSchema },
    triggers: { type: 'array', items: triggerSchema },
  },
};

export const patchTimelineSchema: SchemaDef = {
  type: 'object',
  required: ['version'],
  properties: {
    durationMs: { type: 'number', minimum: 0 },
    loop: { type: 'boolean' },
    playCount: { type: 'integer', minimum: 0 },
    startOffsetMs: { type: 'number', minimum: 0 },
    version: { type: 'integer', minimum: 1 },
    tracks: { type: 'array', items: trackSchema },
    triggers: { type: 'array', items: triggerSchema },
  },
};

export const createTrackSchema: SchemaDef = {
  type: 'object',
  required: ['property', 'keyframes', 'easing'],
  properties: {
    property: { type: 'string', minLength: 1 },
    keyframes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['timeMs', 'value'],
        properties: {
          timeMs: { type: 'number', minimum: 0 },
          value: {},
          easing: { type: 'string' },
        },
      },
    },
    startOffsetMs: { type: 'number', minimum: 0 },
    easing: { type: 'string' },
  },
};

export const createKeyframeSchema: SchemaDef = {
  type: 'object',
  required: ['timeMs', 'value'],
  properties: {
    timeMs: { type: 'number', minimum: 0 },
    value: {},
    easing: { type: 'string' },
  },
};

export const createTriggerSchema: SchemaDef = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['on_click', 'on_enter', 'on_hover', 'on_data_change', 'on_timer'] },
    sourceId: { type: 'string' },
    fieldPath: { type: 'string' },
    offsetMs: { type: 'number' },
    debounceMs: { type: 'number', minimum: 0 },
  },
};

const bezierParamsSchema: SchemaDef = {
  type: 'array',
  items: { type: 'number' },
  minItems: 4,
  // exact 4 items: validated separately
};

const springParamsSchema: SchemaDef = {
  type: 'object',
  required: ['mass', 'stiffness', 'damping'],
  properties: {
    mass: { type: 'number' },
    stiffness: { type: 'number' },
    damping: { type: 'number' },
  },
};

const physicsParamsSchema: SchemaDef = {
  type: 'object',
  required: ['friction', 'strength'],
  properties: {
    friction: { type: 'number', minimum: 0 },
    strength: { type: 'number', minimum: 0 },
  },
};

export const createEasingCurveSchema: SchemaDef = {
  type: 'object',
  required: ['name', 'type', 'params'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['linear', 'cubic_bezier', 'spring', 'physics', 'step'] },
    params: {
      type: 'object',
      properties: {
        bezier: bezierParamsSchema,
        spring: springParamsSchema,
        physics: physicsParamsSchema,
        steps: { type: 'integer', minimum: 1 },
      },
    },
  },
};

export const patchEasingCurveSchema: SchemaDef = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['linear', 'cubic_bezier', 'spring', 'physics', 'step'] },
    params: {
      type: 'object',
      properties: {
        bezier: bezierParamsSchema,
        spring: springParamsSchema,
        physics: physicsParamsSchema,
        steps: { type: 'integer', minimum: 1 },
      },
    },
  },
};

export const createAnimationPresetSchema: SchemaDef = {
  type: 'object',
  required: ['name', 'category', 'definition'],
  properties: {
    name: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: ['entrance', 'exit', 'emphasis'] },
    tags: { type: 'array', items: { type: 'string' } },
    definition: {
      type: 'object',
      required: ['durationMs', 'tracks'],
      properties: {
        durationMs: { type: 'number', minimum: 0 },
        tracks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['property', 'keyframes', 'easing'],
            properties: {
              property: { type: 'string' },
              keyframes: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['timeMs', 'value'],
                  properties: {
                    timeMs: { type: 'number' },
                    value: {},
                    easing: { type: 'string' },
                  },
                },
              },
              easing: { type: 'string' },
            },
          },
        },
        triggers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['on_click', 'on_enter', 'on_hover', 'on_data_change', 'on_timer'] },
              offsetMs: { type: 'number' },
            },
          },
        },
        requiredProperties: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export const createTransitionSchema: SchemaDef = {
  type: 'object',
  required: ['fromSlideId', 'toSlideId', 'type'],
  properties: {
    fromSlideId: { type: 'string', minLength: 1 },
    toSlideId: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['fade', 'slide', 'zoom', 'dissolve', 'push', 'wipe', 'morph'] },
    magicMoveEnabled: { type: 'boolean' },
    options: {
      type: 'object',
      properties: {
        durationMs: { type: 'number', minimum: 0 },
        easing: { type: 'string' },
        direction: { type: 'string', enum: ['left', 'right', 'up', 'down'] },
      },
    },
  },
};

export const putReducedMotionSchema: SchemaDef = {
  type: 'object',
  required: ['mode'],
  properties: {
    mode: { type: 'string', enum: ['follow_os', 'always_reduced', 'always_full'] },
    maxTransitionMs: { type: 'number', minimum: 0 },
    disableParticles: { type: 'boolean' },
    collapseScrollLinked: { type: 'boolean' },
    instantTickers: { type: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

export function validateCreateTimeline(body: unknown): ValidationResult {
  const errors = validateSchema(body, createTimelineSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validatePatchTimeline(body: unknown): ValidationResult {
  const errors = validateSchema(body, patchTimelineSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateTrack(body: unknown): ValidationResult {
  const errors = validateSchema(body, createTrackSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateKeyframe(body: unknown): ValidationResult {
  const errors = validateSchema(body, createKeyframeSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateTrigger(body: unknown): ValidationResult {
  const errors = validateSchema(body, createTriggerSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateEasingCurve(body: unknown): ValidationResult {
  const errors = validateSchema(body, createEasingCurveSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validatePatchEasingCurve(body: unknown): ValidationResult {
  const errors = validateSchema(body, patchEasingCurveSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateAnimationPreset(body: unknown): ValidationResult {
  const errors = validateSchema(body, createAnimationPresetSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validateCreateTransition(body: unknown): ValidationResult {
  const errors = validateSchema(body, createTransitionSchema, 'body');
  return { valid: errors.length === 0, errors };
}

export function validatePutReducedMotion(body: unknown): ValidationResult {
  const errors = validateSchema(body, putReducedMotionSchema, 'body');
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Easing curve business-rule validation
// ---------------------------------------------------------------------------

export interface EasingValidationError {
  readonly message: string;
  readonly code: string;
}

/**
 * Validate easing curve business rules:
 * - cubic_bezier: x1 <= x2 (monotonic)
 * - spring: mass ∈ [0.1,10], stiffness ∈ [10,1000], damping ∈ [1,200]
 */
export function validateEasingCurveRules(
  type: string,
  params: { bezier?: readonly number[]; spring?: { mass: number; stiffness: number; damping: number } },
): EasingValidationError[] {
  const errors: EasingValidationError[] = [];

  if (type === 'cubic_bezier' && params.bezier && params.bezier.length >= 4) {
    const x1 = params.bezier[0]!;
    const x2 = params.bezier[2]!;
    if (x1 > x2) {
      errors.push({
        message: `Non-monotonic cubic_bezier: x1 (${x1}) must be <= x2 (${x2})`,
        code: 'NON_MONOTONIC_BEZIER',
      });
    }
  }

  if (type === 'spring' && params.spring) {
    const { mass, stiffness, damping } = params.spring;
    if (mass < 0.1 || mass > 10) {
      errors.push({
        message: `Spring mass (${mass}) must be in [0.1, 10]`,
        code: 'SPRING_MASS_OUT_OF_BOUNDS',
      });
    }
    if (stiffness < 10 || stiffness > 1000) {
      errors.push({
        message: `Spring stiffness (${stiffness}) must be in [10, 1000]`,
        code: 'SPRING_STIFFNESS_OUT_OF_BOUNDS',
      });
    }
    if (damping < 1 || damping > 200) {
      errors.push({
        message: `Spring damping (${damping}) must be in [1, 200]`,
        code: 'SPRING_DAMPING_OUT_OF_BOUNDS',
      });
    }
  }

  return errors;
}
