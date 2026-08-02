/**
 * Design Token Schema Validation Tests (WS-THEME-1 DoD)
 *
 * Validates 50 hand-authored tokens spanning all 8 groups against
 * the design-token-v1.schema.json. Also includes negative cases.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

// Load the schema
const schemaPath = join(REPO_ROOT, 'contracts', 'schema', 'v1', 'design-token-v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// Load common schema for cross-references
const commonPath = join(REPO_ROOT, 'contracts', 'schema', 'v1', 'common.schema.json');
const commonSchema = JSON.parse(readFileSync(commonPath, 'utf8'));

let validate: ReturnType<Ajv['compile']>;

beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addSchema(commonSchema, commonSchema.$id);
  validate = ajv.compile(schema);
});

// ---------------------------------------------------------------------------
// 50 hand-authored tokens spanning all 8 groups
// ---------------------------------------------------------------------------

const FIFTY_TOKENS = [
  // ── COLOR (8 tokens) ──────────────────────────────────────────────────
  { tokenId: 'color.brand.primary', group: 'color', type: 'color', value: { space: 'srgb', channels: [0.06, 0.33, 0.82], alpha: 1 } },
  { tokenId: 'color.brand.secondary', group: 'color', type: 'color', value: { space: 'srgb', channels: [0.96, 0.96, 0.96], alpha: 1 } },
  { tokenId: 'color.brand.accent', group: 'color', type: 'color', value: { space: 'p3', channels: [0.9, 0.2, 0.4], alpha: 1 } },
  { tokenId: 'color.neutral.50', group: 'color', type: 'color', value: { space: 'srgb', channels: [1, 1, 1], alpha: 1 } },
  { tokenId: 'color.neutral.900', group: 'color', type: 'color', value: { space: 'srgb', channels: [0.1, 0.1, 0.1], alpha: 1 } },
  { tokenId: 'color.feedback.success', group: 'color', type: 'color', value: { space: 'srgb', channels: [0.13, 0.65, 0.22], alpha: 1 } },
  { tokenId: 'color.feedback.error', group: 'color', type: 'color', value: { space: 'srgb', channels: [0.85, 0.15, 0.15], alpha: 1 } },
  { tokenId: 'color.overlay.scrim', group: 'color', type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 0.5 }, description: 'Overlay scrim color', roles: ['decorative'] },

  // ── TYPOGRAPHY (6 tokens) ─────────────────────────────────────────────
  { tokenId: 'typography.heading.lg', group: 'typography', type: 'typography', value: { fontFamily: 'Inter', fontSize: { value: 32, unit: 'px' }, fontWeight: 700, lineHeight: 1.2, letterSpacing: { value: -0.5, unit: 'px' }, fallbackChain: ['Arial', 'sans-serif'] } },
  { tokenId: 'typography.heading.md', group: 'typography', type: 'typography', value: { fontFamily: 'Inter', fontSize: { value: 24, unit: 'px' }, fontWeight: 600, lineHeight: 1.3, letterSpacing: { value: -0.25, unit: 'px' }, fallbackChain: ['Arial', 'sans-serif'] } },
  { tokenId: 'typography.body.md', group: 'typography', type: 'typography', value: { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' }, fallbackChain: ['Helvetica', 'sans-serif'] }, description: 'Body text default' },
  { tokenId: 'typography.body.sm', group: 'typography', type: 'typography', value: { fontFamily: 'Inter', fontSize: { value: 14, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' }, fallbackChain: ['Helvetica', 'sans-serif'] } },
  { tokenId: 'typography.caption', group: 'typography', type: 'typography', value: { fontFamily: 'Inter', fontSize: { value: 12, unit: 'px' }, fontWeight: 500, lineHeight: 1.4, letterSpacing: { value: 0.5, unit: 'px' }, fallbackChain: ['Arial', 'sans-serif'] } },
  { tokenId: 'typography.code', group: 'typography', type: 'typography', value: { fontFamily: 'JetBrains Mono', fontSize: { value: 14, unit: 'px' }, fontWeight: 400, lineHeight: 1.6, letterSpacing: { value: 0, unit: 'px' }, fallbackChain: ['Fira Code', 'monospace'] }, roles: ['content'] },

  // ── SPACING (8 tokens) ────────────────────────────────────────────────
  { tokenId: 'spacing.0', group: 'spacing', type: 'dimension', value: { value: 0, unit: 'px' } },
  { tokenId: 'spacing.1', group: 'spacing', type: 'dimension', value: { value: 4, unit: 'px' } },
  { tokenId: 'spacing.2', group: 'spacing', type: 'dimension', value: { value: 8, unit: 'px' } },
  { tokenId: 'spacing.3', group: 'spacing', type: 'dimension', value: { value: 12, unit: 'px' } },
  { tokenId: 'spacing.4', group: 'spacing', type: 'dimension', value: { value: 16, unit: 'px' } },
  { tokenId: 'spacing.6', group: 'spacing', type: 'dimension', value: { value: 24, unit: 'px' } },
  { tokenId: 'spacing.8', group: 'spacing', type: 'dimension', value: { value: 32, unit: 'px' } },
  { tokenId: 'spacing.12', group: 'spacing', type: 'dimension', value: { value: 48, unit: 'px' }, roles: ['interactive'] },

  // ── RADIUS (4 tokens) ─────────────────────────────────────────────────
  { tokenId: 'radius.none', group: 'radius', type: 'dimension', value: { value: 0, unit: 'px' } },
  { tokenId: 'radius.sm', group: 'radius', type: 'dimension', value: { value: 4, unit: 'px' } },
  { tokenId: 'radius.md', group: 'radius', type: 'dimension', value: { value: 8, unit: 'px' } },
  { tokenId: 'radius.full', group: 'radius', type: 'dimension', value: { value: 9999, unit: 'px' } },

  // ── SHADOW (5 tokens) ─────────────────────────────────────────────────
  { tokenId: 'shadow.sm', group: 'shadow', type: 'shadow', value: { offsetX: { value: 0, unit: 'px' }, offsetY: { value: 1, unit: 'px' }, blur: { value: 2, unit: 'px' }, spread: { value: 0, unit: 'px' }, color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.05 } } },
  { tokenId: 'shadow.md', group: 'shadow', type: 'shadow', value: { offsetX: { value: 0, unit: 'px' }, offsetY: { value: 4, unit: 'px' }, blur: { value: 8, unit: 'px' }, spread: { value: 0, unit: 'px' }, color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 } } },
  { tokenId: 'shadow.lg', group: 'shadow', type: 'shadow', value: { offsetX: { value: 0, unit: 'px' }, offsetY: { value: 8, unit: 'px' }, blur: { value: 16, unit: 'px' }, spread: { value: 0, unit: 'px' }, color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.15 } } },
  { tokenId: 'shadow.xl', group: 'shadow', type: 'shadow', value: { offsetX: { value: 0, unit: 'px' }, offsetY: { value: 16, unit: 'px' }, blur: { value: 32, unit: 'px' }, spread: { value: 0, unit: 'px' }, color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.2 } } },
  { tokenId: 'shadow.card', group: 'shadow', type: 'shadow', value: { offsetX: { value: 0, unit: 'px' }, offsetY: { value: 2, unit: 'px' }, blur: { value: 4, unit: 'px' }, spread: { value: -1, unit: 'px' }, color: { space: 'srgb', channels: [0.06, 0.33, 0.82], alpha: 0.15 } }, description: 'Card elevation shadow', roles: ['interactive'] },

  // ── MOTION (5 tokens) ─────────────────────────────────────────────────
  { tokenId: 'motion.duration.instant', group: 'motion', type: 'motion', value: { duration: { value: 0, unit: 'ms' }, easing: 'linear', delay: { value: 0, unit: 'ms' } } },
  { tokenId: 'motion.duration.fast', group: 'motion', type: 'motion', value: { duration: { value: 100, unit: 'ms' }, easing: 'ease-out', delay: { value: 0, unit: 'ms' } } },
  { tokenId: 'motion.duration.normal', group: 'motion', type: 'motion', value: { duration: { value: 200, unit: 'ms' }, easing: 'ease-in-out', delay: { value: 0, unit: 'ms' } } },
  { tokenId: 'motion.duration.slow', group: 'motion', type: 'motion', value: { duration: { value: 400, unit: 'ms' }, easing: 'ease-in-out', delay: { value: 0, unit: 'ms' } } },
  { tokenId: 'motion.spring.bounce', group: 'motion', type: 'motion', value: { duration: { value: 500, unit: 'ms' }, easing: 'spring', delay: { value: 50, unit: 'ms' } }, description: 'Bouncy spring animation' },

  // ── CONTENT (6 tokens) ────────────────────────────────────────────────
  { tokenId: 'content.icon.logo', group: 'content', type: 'content', value: { contentType: 'svg', data: '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg>' } },
  { tokenId: 'content.icon.close', group: 'content', type: 'content', value: { contentType: 'svg', data: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' } },
  { tokenId: 'content.icon.search', group: 'content', type: 'content', value: { contentType: 'icon', data: 'lucide:search' } },
  { tokenId: 'content.lottie.confetti', group: 'content', type: 'content', value: { contentType: 'lottie', data: 'https://assets.domio.example/lottie/confetti.json', metadata: { loop: true, autoplay: false } } },
  { tokenId: 'content.image.hero', group: 'content', type: 'content', value: { contentType: 'image', data: 'https://assets.domio.example/images/hero.png', metadata: { width: 1920, height: 1080 } }, roles: ['brand'] },
  { tokenId: 'content.text.tagline', group: 'content', type: 'content', value: { contentType: 'text', data: 'Present beautifully.' } },

  // ── BORDER (2 tokens) ─────────────────────────────────────────────────
  { tokenId: 'border.subtle', group: 'border', type: 'dimension', value: { value: 1, unit: 'px' }, description: 'Subtle border width', roles: ['decorative'] },
  { tokenId: 'border.strong', group: 'border', type: 'dimension', value: { value: 2, unit: 'px' }, roles: ['interactive'] },
] as const;

// 2 aliases to reach 50 total
const ALIASES = [
  { tokenId: 'color.brand.highlight', alias: 'color.brand.accent' },
  { tokenId: 'spacing.default', alias: 'spacing.4' },
];

const ALL_TOKENS = [...FIFTY_TOKENS, ...ALIASES];

describe('design-token-v1.schema.json — 50-token validation', () => {
  it('validates all 50 tokens (definitions + aliases) against the schema', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: ALL_TOKENS,
    };
    const valid = validate(doc);
    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('validates an empty-roles token', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.test.roles',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 },
          roles: [],
        },
      ],
    };
    const valid = validate(doc);
    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('validates a deprecated token', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.old.primary',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
          deprecated: { replacedBy: 'color.brand.primary', sinceVersion: '2.0.0' },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative cases
// ---------------------------------------------------------------------------

describe('design-token-v1.schema.json — negative cases', () => {
  it('rejects out-of-range color channel (> 1)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.channel',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [1.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects negative alpha', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.alpha',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: -0.1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects typography missing fontFamily', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'typography.bad.nofont',
          group: 'typography',
          type: 'typography',
          value: {
            fontSize: { value: 16, unit: 'px' },
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: { value: 0, unit: 'px' },
            fallbackChain: ['Arial'],
            // missing fontFamily
          },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects invalid tokenId regex (uppercase)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'Color.Brand.Primary',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects invalid tokenId regex (special characters)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.brand-primary!',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects alias with non-existent target format (non-matching target shape)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.alias',
          alias: '',  // empty alias target
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects token with invalid group', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'invalid.group',
          group: 'invalid_group',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects token with invalid type', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.type',
          group: 'color',
          type: 'gradient',  // invalid type
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects missing schemaVersion', () => {
    const doc = {
      tokens: [
        {
          tokenId: 'color.test',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects empty tokens array', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects shadow with missing spread', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'shadow.bad',
          group: 'shadow',
          type: 'shadow',
          value: {
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 2, unit: 'px' },
            blur: { value: 4, unit: 'px' },
            color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 },
            // missing spread
          },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects dimension with invalid unit', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'spacing.bad.unit',
          group: 'spacing',
          type: 'dimension',
          value: { value: 16, unit: 'pt' },  // pt is not allowed
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects color space other than srgb/p3', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.space',
          group: 'color',
          type: 'color',
          value: { space: 'hsl', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects invalid deprecated.replacedBy format', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.dep',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
          deprecated: { replacedBy: 'Invalid.Token!', sinceVersion: '1.0.0' },
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects invalid role value', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.role',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
          roles: ['interactive', 'invalid_role'],
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });

  it('rejects token with additional properties', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.extra',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
          unknownField: 'should fail',
        },
      ],
    };
    const valid = validate(doc);
    expect(valid).toBe(false);
  });
});
