/**
 * @domio/tokens — Validation helpers.
 *
 * Run-time checks for shape integrity.  These are intentionally light
 * (no AJV yet); the canonical JSON-Schema lives in
 * `contracts/schema/v1/design-token-v1.schema.json` and the build
 * pipeline validates upstream schemas against it.
 */

import type {
  TokenColor,
  TokenDimension,
  TokenTypography,
  TokenShadow,
  TokenMotion,
  TokenContent,
} from './index.js';

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
  readonly code: string;
};

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Token value shape validation
// ---------------------------------------------------------------------------

/**
 * Validate a single TokenValue.  Returns issues with JSON-Style paths.
 */
export function validateTokenValue(value: unknown, path = 'value'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenValue must be an object', code: 'TYPE_ERROR' }] };
  }
  const v = value as { type?: unknown; value?: unknown };
  if (typeof v.type !== 'string' || !KNOWN_TYPES.has(v.type)) {
    issues.push({ path: `${path}.type`, message: `Unknown token type: ${String(v.type)}`, code: 'UNKNOWN_TYPE' });
    return { valid: false, issues };
  }
  switch (v.type) {
    case 'color':
      issues.push(...validateColor(v.value, `${path}.value`).issues);
      break;
    case 'dimension':
      issues.push(...validateDimension(v.value, `${path}.value`).issues);
      break;
    case 'typography':
      issues.push(...validateTypography(v.value, `${path}.value`).issues);
      break;
    case 'shadow':
      issues.push(...validateShadow(v.value, `${path}.value`).issues);
      break;
    case 'motion':
      issues.push(...validateMotion(v.value, `${path}.value`).issues);
      break;
    case 'content':
      issues.push(...validateContent(v.value, `${path}.value`).issues);
      break;
  }
  return { valid: issues.length === 0, issues };
}

const KNOWN_TYPES = new Set(['color', 'dimension', 'typography', 'shadow', 'motion', 'content']);

/**
 * Validate the tokenId naming convention.
 * Pattern: `^[a-z]+(?:\\.[a-z0-9]+)*$` — matches the JSON-Schema.
 */
const TOKEN_ID_PATTERN = /^[a-z]+(?:\.[a-z0-9]+)*$/;

export function validateTokenId(tokenId: string): ValidationResult {
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    return {
      valid: false,
      issues: [
        {
          path: 'tokenId',
          message: `TokenId "${tokenId}" must match ${TOKEN_ID_PATTERN.source}`,
          code: 'TOKEN_ID_FORMAT',
        },
      ],
    };
  }
  return { valid: true, issues: [] };
}

export function validateColor(value: unknown, path = 'color'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenColor must be an object', code: 'TYPE_ERROR' }] };
  }
  const c = value as Partial<TokenColor>;
  if (c.space !== 'srgb' && c.space !== 'p3') {
    issues.push({ path: `${path}.space`, message: `Color space must be srgb or p3`, code: 'COLOR_SPACE' });
  }
  if (!Array.isArray(c.channels) || c.channels.length !== 3) {
    issues.push({ path: `${path}.channels`, message: 'Color channels must be [r, g, b]', code: 'CHANNELS_LENGTH' });
  } else {
    for (let i = 0; i < c.channels.length; i++) {
      const ch = c.channels[i];
      if (typeof ch !== 'number' || !Number.isFinite(ch) || ch < 0 || ch > 1) {
        issues.push({
          path: `${path}.channels[${i}]`,
          message: `Channel must be a number in [0, 1]`,
          code: 'CHANNEL_RANGE',
        });
      }
    }
  }
  if (typeof c.alpha !== 'number' || !Number.isFinite(c.alpha) || c.alpha < 0 || c.alpha > 1) {
    issues.push({ path: `${path}.alpha`, message: 'Alpha must be in [0, 1]', code: 'ALPHA_RANGE' });
  }
  return { valid: issues.length === 0, issues };
}

export function validateDimension(value: unknown, path = 'dimension'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenDimension must be an object', code: 'TYPE_ERROR' }] };
  }
  const d = value as Partial<TokenDimension>;
  if (typeof d.value !== 'number' || !Number.isFinite(d.value)) {
    issues.push({ path: `${path}.value`, message: 'Dimension value must be a number', code: 'TYPE_ERROR' });
  }
  if (!['px', 'rem', 'em', '%'].includes(String(d.unit))) {
    issues.push({ path: `${path}.unit`, message: 'Dimension unit must be px, rem, em, or %', code: 'DIMENSION_UNIT' });
  }
  return { valid: issues.length === 0, issues };
}

export function validateTypography(value: unknown, path = 'typography'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenTypography must be an object', code: 'TYPE_ERROR' }] };
  }
  const t = value as Partial<TokenTypography>;
  if (typeof t.fontFamily !== 'string' || t.fontFamily.length === 0) {
    issues.push({ path: `${path}.fontFamily`, message: 'Typography must declare a fontFamily', code: 'TYPOGRAPHY_FAMILY' });
  }
  if (typeof t.fontWeight !== 'number' || t.fontWeight < 100 || t.fontWeight > 900) {
    issues.push({ path: `${path}.fontWeight`, message: 'Font weight must be 100–900', code: 'TYPOGRAPHY_WEIGHT' });
  }
  if (typeof t.lineHeight !== 'number' || t.lineHeight <= 0) {
    issues.push({ path: `${path}.lineHeight`, message: 'Line height must be > 0', code: 'TYPOGRAPHY_LINE_HEIGHT' });
  }
  if (!Array.isArray(t.fallbackChain)) {
    issues.push({ path: `${path}.fallbackChain`, message: 'fallbackChain must be an array', code: 'TYPOGRAPHY_FALLBACK' });
  }
  if (t.fontSize !== undefined) {
    issues.push(...validateDimension(t.fontSize, `${path}.fontSize`).issues);
  }
  return { valid: issues.length === 0, issues };
}

export function validateShadow(value: unknown, path = 'shadow'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenShadow must be an object', code: 'TYPE_ERROR' }] };
  }
  const s = value as Partial<TokenShadow>;
  for (const k of ['offsetX', 'offsetY', 'blur', 'spread'] as const) {
    issues.push(...validateDimension(s[k], `${path}.${k}`).issues);
  }
  if (s.color !== undefined) {
    issues.push(...validateColor(s.color, `${path}.color`).issues);
  }
  return { valid: issues.length === 0, issues };
}

export function validateMotion(value: unknown, path = 'motion'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenMotion must be an object', code: 'TYPE_ERROR' }] };
  }
  const m = value as Partial<TokenMotion>;
  const td = (v: unknown, p: string) => {
    if (v === null || typeof v !== 'object') {
      issues.push({ path: p, message: 'TokenTimeDuration must be an object', code: 'TYPE_ERROR' });
      return;
    }
    const td = v as { value?: unknown; unit?: unknown };
    if (typeof td.value !== 'number' || !Number.isFinite(td.value) || td.value < 0) {
      issues.push({ path: `${p}.value`, message: 'Duration value must be ≥ 0', code: 'TIME_RANGE' });
    }
    if (!['ms', 's'].includes(String(td.unit))) {
      issues.push({ path: `${p}.unit`, message: 'Duration unit must be ms or s', code: 'TIME_UNIT' });
    }
  };
  td(m.duration, `${path}.duration`);
  td(m.delay, `${path}.delay`);
  const knownEasings = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']);
  if (typeof m.easing !== 'string' || !knownEasings.has(m.easing)) {
    issues.push({ path: `${path}.easing`, message: `Unknown easing: ${String(m.easing)}`, code: 'MOTION_EASING' });
  }
  return { valid: issues.length === 0, issues };
}

export function validateContent(value: unknown, path = 'content'): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (value === null || typeof value !== 'object') {
    return { valid: false, issues: [{ path, message: 'TokenContent must be an object', code: 'TYPE_ERROR' }] };
  }
  const c = value as Partial<TokenContent>;
  if (!['text', 'icon', 'image', 'svg', 'lottie'].includes(String(c.contentType))) {
    issues.push({ path: `${path}.contentType`, message: 'Unknown contentType', code: 'CONTENT_TYPE' });
  }
  if (typeof c.data !== 'string') {
    issues.push({ path: `${path}.data`, message: 'data must be a string', code: 'CONTENT_DATA' });
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Validate a full token definition (tokenId + value).
 */
export function validateTokenDefinition(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (input === null || typeof input !== 'object') {
    return { valid: false, issues: [{ path: '', message: 'Token definition must be an object', code: 'TYPE_ERROR' }] };
  }
  const d = input as { tokenId?: unknown; value?: unknown };
  if (typeof d.tokenId === 'string') {
    issues.push(...validateTokenId(d.tokenId).issues);
  } else {
    issues.push({ path: 'tokenId', message: 'tokenId is required', code: 'REQUIRED' });
  }
  if (d.value !== undefined) {
    issues.push(...validateTokenValue(d.value).issues);
  }
  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Alias graph helpers
// ---------------------------------------------------------------------------

/**
 * Walk the alias graph and detect any cycle.
 *
 * Returns the cycle chain if found, otherwise null.  Empty arrays
 * mean "no cycle".
 *
 * @param start - the starting tokenId
 * @param edges - the alias edges (aliasTokenId -> targetTokenId)
 */
export function findTokenAliasCycle(
  start: string,
  edges: readonly { aliasTokenId: string; targetTokenId: string }[],
): readonly string[] | null {
  const graph = new Map<string, string>();
  for (const e of edges) graph.set(e.aliasTokenId, e.targetTokenId);

  const visited = new Set<string>();
  const chain: string[] = [];
  let current: string | undefined = start;
  while (current !== undefined) {
    if (visited.has(current)) {
      const cycleStart = chain.indexOf(current);
      return chain.slice(cycleStart).concat(current);
    }
    visited.add(current);
    chain.push(current);
    current = graph.get(current);
  }
  return null;
}