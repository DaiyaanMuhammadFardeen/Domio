import { describe, it, expect } from 'vitest';
import { readText } from '../read.js';
import { REPO_ROOT } from '../repo-root.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * P07 contract tests — design-token-v1.schema.json.
 *
 * Validates 50 hand-authored tokens spanning all 8 groups (color, typography,
 * spacing, radius, shadow, motion, content, border) against the canonical
 * schema. Covers positive validation (individual + bundled), negative cases,
 * alias shapes, deprecation metadata, and TokenValue oneOf discrimination.
 *
 * Schema is draft-2020-12; ajv 8 defaults to draft-07, so we strip
 * $schema/$id before compiling (same approach as P06 component-package).
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function compile(schema: Record<string, unknown>): ReturnType<typeof ajv.compile> {
  // ajv 8 keys compiled schemas by $id; strip both meta fields so each
  // schema can be compiled more than once across tests.
  const { $schema, $id, ...rest } = schema;
  void $schema;
  void $id;
  return ajv.compile(rest);
}

const SCHEMA_ROOT = `${REPO_ROOT}/contracts/schema/v1`;

function load(name: string): Record<string, unknown> {
  return JSON.parse(readText(`${SCHEMA_ROOT}/${name}`)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema compilation
// ---------------------------------------------------------------------------

const fullSchema = load('design-token-v1.schema.json');
const validateDoc = compile(fullSchema);

// Sub-schemas for individual token validation — reuse the definitions block
// from the parent so internal $refs resolve identically.
const validateTokenDef = compile({
  definitions: fullSchema.definitions,
  $ref: '#/definitions/TokenDefinition',
} as Record<string, unknown>);

const validateTokenAlias = compile({
  definitions: fullSchema.definitions,
  $ref: '#/definitions/TokenAlias',
} as Record<string, unknown>);

// ---------------------------------------------------------------------------
// 50 hand-authored tokens spanning all 8 groups
// ---------------------------------------------------------------------------

const TOKENS = [
  // ── COLOR (8) ────────────────────────────────────────────────────────────
  {
    tokenId: 'color.brand.primary',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0.06, 0.33, 0.82], alpha: 1 },
    description: 'Primary brand color — CTA, link, focus ring',
    roles: ['interactive', 'brand'],
  },
  {
    tokenId: 'color.brand.secondary',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0.96, 0.96, 0.96], alpha: 1 },
    roles: ['brand'],
  },
  {
    tokenId: 'color.brand.accent',
    group: 'color',
    type: 'color',
    value: { space: 'p3', channels: [0.9, 0.2, 0.4], alpha: 1 },
    roles: ['brand'],
  },
  {
    tokenId: 'color.neutral.50',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [1, 1, 1], alpha: 1 },
    roles: ['content'],
  },
  {
    tokenId: 'color.neutral.900',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0.1, 0.1, 0.1], alpha: 1 },
    roles: ['content'],
  },
  {
    tokenId: 'color.feedback.success',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0.13, 0.65, 0.22], alpha: 1 },
    roles: ['interactive'],
  },
  {
    tokenId: 'color.feedback.error',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0.85, 0.15, 0.15], alpha: 1 },
    roles: ['interactive'],
  },
  {
    tokenId: 'color.overlay.scrim',
    group: 'color',
    type: 'color',
    value: { space: 'srgb', channels: [0, 0, 0], alpha: 0.5 },
    description: 'Overlay scrim color',
    roles: ['decorative'],
  },

  // ── TYPOGRAPHY (6) ───────────────────────────────────────────────────────
  {
    tokenId: 'typography.heading.lg',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'Inter',
      fontSize: { value: 32, unit: 'px' },
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: { value: -0.5, unit: 'px' },
      fallbackChain: ['Arial', 'sans-serif'],
    },
    roles: ['brand'],
  },
  {
    tokenId: 'typography.heading.md',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'Inter',
      fontSize: { value: 24, unit: 'px' },
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: { value: -0.25, unit: 'px' },
      fallbackChain: ['Arial', 'sans-serif'],
    },
  },
  {
    tokenId: 'typography.body.md',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: ['Helvetica', 'sans-serif'],
    },
    description: 'Body text default',
    roles: ['content'],
  },
  {
    tokenId: 'typography.body.sm',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'Inter',
      fontSize: { value: 14, unit: 'px' },
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: ['Helvetica', 'sans-serif'],
    },
  },
  {
    tokenId: 'typography.caption',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'Inter',
      fontSize: { value: 12, unit: 'px' },
      fontWeight: 500,
      lineHeight: 1.4,
      letterSpacing: { value: 0.5, unit: 'px' },
      fallbackChain: ['Arial', 'sans-serif'],
    },
  },
  {
    tokenId: 'typography.code',
    group: 'typography',
    type: 'typography',
    value: {
      fontFamily: 'JetBrains Mono',
      fontSize: { value: 14, unit: 'px' },
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: ['Fira Code', 'monospace'],
    },
    roles: ['content'],
  },

  // ── SPACING (8) ──────────────────────────────────────────────────────────
  {
    tokenId: 'spacing.0',
    group: 'spacing',
    type: 'dimension',
    value: { value: 0, unit: 'px' },
  },
  {
    tokenId: 'spacing.1',
    group: 'spacing',
    type: 'dimension',
    value: { value: 4, unit: 'px' },
  },
  {
    tokenId: 'spacing.2',
    group: 'spacing',
    type: 'dimension',
    value: { value: 8, unit: 'px' },
  },
  {
    tokenId: 'spacing.3',
    group: 'spacing',
    type: 'dimension',
    value: { value: 12, unit: 'px' },
  },
  {
    tokenId: 'spacing.4',
    group: 'spacing',
    type: 'dimension',
    value: { value: 16, unit: 'px' },
  },
  {
    tokenId: 'spacing.6',
    group: 'spacing',
    type: 'dimension',
    value: { value: 24, unit: 'px' },
  },
  {
    tokenId: 'spacing.8',
    group: 'spacing',
    type: 'dimension',
    value: { value: 32, unit: 'px' },
  },
  {
    tokenId: 'spacing.12',
    group: 'spacing',
    type: 'dimension',
    value: { value: 48, unit: 'px' },
    roles: ['interactive'],
  },

  // ── RADIUS (5) ───────────────────────────────────────────────────────────
  {
    tokenId: 'radius.none',
    group: 'radius',
    type: 'dimension',
    value: { value: 0, unit: 'px' },
  },
  {
    tokenId: 'radius.sm',
    group: 'radius',
    type: 'dimension',
    value: { value: 4, unit: 'px' },
  },
  {
    tokenId: 'radius.md',
    group: 'radius',
    type: 'dimension',
    value: { value: 8, unit: 'px' },
  },
  {
    tokenId: 'radius.lg',
    group: 'radius',
    type: 'dimension',
    value: { value: 16, unit: 'px' },
  },
  {
    tokenId: 'radius.full',
    group: 'radius',
    type: 'dimension',
    value: { value: 9999, unit: 'px' },
  },

  // ── SHADOW (5) ───────────────────────────────────────────────────────────
  {
    tokenId: 'shadow.sm',
    group: 'shadow',
    type: 'shadow',
    value: {
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 1, unit: 'px' },
      blur: { value: 2, unit: 'px' },
      spread: { value: 0, unit: 'px' },
      color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.05 },
    },
  },
  {
    tokenId: 'shadow.md',
    group: 'shadow',
    type: 'shadow',
    value: {
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 4, unit: 'px' },
      blur: { value: 8, unit: 'px' },
      spread: { value: 0, unit: 'px' },
      color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 },
    },
  },
  {
    tokenId: 'shadow.lg',
    group: 'shadow',
    type: 'shadow',
    value: {
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 8, unit: 'px' },
      blur: { value: 16, unit: 'px' },
      spread: { value: 0, unit: 'px' },
      color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.15 },
    },
  },
  {
    tokenId: 'shadow.xl',
    group: 'shadow',
    type: 'shadow',
    value: {
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 16, unit: 'px' },
      blur: { value: 32, unit: 'px' },
      spread: { value: 0, unit: 'px' },
      color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.2 },
    },
  },
  {
    tokenId: 'shadow.card',
    group: 'shadow',
    type: 'shadow',
    value: {
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 2, unit: 'px' },
      blur: { value: 4, unit: 'px' },
      spread: { value: -1, unit: 'px' },
      color: { space: 'srgb', channels: [0.06, 0.33, 0.82], alpha: 0.15 },
    },
    description: 'Card elevation shadow',
    roles: ['interactive'],
  },

  // ── MOTION (5) ───────────────────────────────────────────────────────────
  {
    tokenId: 'motion.duration.instant',
    group: 'motion',
    type: 'motion',
    value: {
      duration: { value: 0, unit: 'ms' },
      easing: 'linear',
      delay: { value: 0, unit: 'ms' },
    },
  },
  {
    tokenId: 'motion.duration.fast',
    group: 'motion',
    type: 'motion',
    value: {
      duration: { value: 100, unit: 'ms' },
      easing: 'ease-out',
      delay: { value: 0, unit: 'ms' },
    },
  },
  {
    tokenId: 'motion.duration.normal',
    group: 'motion',
    type: 'motion',
    value: {
      duration: { value: 200, unit: 'ms' },
      easing: 'ease-in-out',
      delay: { value: 0, unit: 'ms' },
    },
  },
  {
    tokenId: 'motion.duration.slow',
    group: 'motion',
    type: 'motion',
    value: {
      duration: { value: 400, unit: 'ms' },
      easing: 'ease-in-out',
      delay: { value: 0, unit: 'ms' },
    },
  },
  {
    tokenId: 'motion.spring.bounce',
    group: 'motion',
    type: 'motion',
    value: {
      duration: { value: 500, unit: 'ms' },
      easing: 'spring',
      delay: { value: 50, unit: 'ms' },
    },
    description: 'Bouncy spring animation',
  },

  // ── CONTENT (6) ──────────────────────────────────────────────────────────
  {
    tokenId: 'content.icon.logo',
    group: 'content',
    type: 'content',
    value: {
      contentType: 'svg',
      data: '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg>',
    },
  },
  {
    tokenId: 'content.icon.close',
    group: 'content',
    type: 'content',
    value: {
      contentType: 'svg',
      data: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    },
  },
  {
    tokenId: 'content.icon.search',
    group: 'content',
    type: 'content',
    value: { contentType: 'icon', data: 'lucide:search' },
  },
  {
    tokenId: 'content.lottie.confetti',
    group: 'content',
    type: 'content',
    value: {
      contentType: 'lottie',
      data: 'https://assets.domio.example/lottie/confetti.json',
      metadata: { loop: true, autoplay: false },
    },
  },
  {
    tokenId: 'content.image.hero',
    group: 'content',
    type: 'content',
    value: {
      contentType: 'image',
      data: 'https://assets.domio.example/images/hero.png',
      metadata: { width: 1920, height: 1080 },
    },
    roles: ['brand'],
  },
  {
    tokenId: 'content.text.tagline',
    group: 'content',
    type: 'content',
    value: { contentType: 'text', data: 'Present beautifully.' },
  },

  // ── BORDER (5) ───────────────────────────────────────────────────────────
  {
    tokenId: 'border.subtle',
    group: 'border',
    type: 'dimension',
    value: { value: 1, unit: 'px' },
    description: 'Subtle border width',
    roles: ['decorative'],
  },
  {
    tokenId: 'border.strong',
    group: 'border',
    type: 'dimension',
    value: { value: 2, unit: 'px' },
    roles: ['interactive'],
  },
  {
    tokenId: 'border.focus',
    group: 'border',
    type: 'dimension',
    value: { value: 2, unit: 'px' },
    description: 'Focus ring border width',
    roles: ['interactive'],
  },
  {
    tokenId: 'border.thick',
    group: 'border',
    type: 'dimension',
    value: { value: 3, unit: 'px' },
    roles: ['decorative'],
  },
  {
    tokenId: 'border.dashed',
    group: 'border',
    type: 'dimension',
    value: { value: 1, unit: 'px' },
    description: 'Dashed separator border',
  },
] as const satisfies readonly Record<string, unknown>[];

// Aliases to reach exactly 50 items (48 definitions + 2 aliases).
const ALIASES = [
  { tokenId: 'color.brand.highlight', alias: 'color.brand.accent' },
  { tokenId: 'spacing.default', alias: 'spacing.4' },
] as const satisfies readonly Record<string, unknown>[];

const ALL_TOKENS = [...TOKENS, ...ALIASES];

// A deprecated token for the deprecation sub-test.
const DEPRECATED_TOKEN = {
  tokenId: 'color.old.primary',
  group: 'color',
  type: 'color',
  value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
  deprecated: { replacedBy: 'color.brand.primary', sinceVersion: '1.0.0' },
};

// ---------------------------------------------------------------------------
// Positive tests
// ---------------------------------------------------------------------------

describe('P07 design-token-v1.schema.json — 50-token bundle', () => {
  it(`validates all ${ALL_TOKENS.length} tokens in a single document`, () => {
    const doc = { schemaVersion: '1.0.0', tokens: ALL_TOKENS };
    expect(validateDoc(doc), JSON.stringify(validateDoc.errors)).toBe(true);
  });

  it('reports exact item count', () => {
    expect(ALL_TOKENS.length).toBe(50);
  });
});

describe('P07 design-token-v1.schema.json — individual token validation', () => {
  const definitions = TOKENS.filter(
    (t): t is (typeof TOKENS)[number] & { group: string; type: string } => 'group' in t,
  );

  it(`validates all ${definitions.length} TokenDefinition items individually`, () => {
    for (const token of definitions) {
      expect(
        validateTokenDef(token),
        `TokenDefinition ${token.tokenId}: ${JSON.stringify(validateTokenDef.errors)}`,
      ).toBe(true);
    }
  });

  it(`validates all ${ALIASES.length} TokenAlias items individually`, () => {
    for (const alias of ALIASES) {
      expect(
        validateTokenAlias(alias),
        `TokenAlias ${alias.tokenId}: ${JSON.stringify(validateTokenAlias.errors)}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative cases — each must be rejected
// ---------------------------------------------------------------------------

describe('P07 design-token-v1.schema.json — negative cases', () => {
  const token = (overrides: Record<string, unknown>) => {
    const base = {
      tokenId: 'color.test.neg',
      group: 'color',
      type: 'color',
      value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
    };
    return { schemaVersion: '1.0.0', tokens: [{ ...base, ...overrides }] };
  };

  it('rejects out-of-range color channel (> 1)', () => {
    expect(
      validateDoc(token({ value: { space: 'srgb', channels: [1.5, 0.5, 0.5], alpha: 1 } })),
    ).toBe(false);
  });

  it('rejects negative alpha', () => {
    expect(
      validateDoc(token({ value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: -0.1 } })),
    ).toBe(false);
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
    expect(validateDoc(doc)).toBe(false);
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
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects invalid tokenId regex (empty segment — double dot)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color..brand',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects dimension with unknown unit (pt)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'spacing.bad.unit',
          group: 'spacing',
          type: 'dimension',
          value: { value: 16, unit: 'pt' },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects shadow missing blur', () => {
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
            // blur missing
            spread: { value: 0, unit: 'px' },
            color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 },
          },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects motion with invalid easing', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'motion.bad',
          group: 'motion',
          type: 'motion',
          value: {
            duration: { value: 200, unit: 'ms' },
            easing: 'bounce', // not in enum
            delay: { value: 0, unit: 'ms' },
          },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects content missing data', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'content.bad',
          group: 'content',
          type: 'content',
          value: {
            contentType: 'svg',
            // data missing
          },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects color space other than srgb/p3', () => {
    expect(
      validateDoc(token({ value: { space: 'hsl', channels: [0.5, 0.5, 0.5], alpha: 1 } })),
    ).toBe(false);
  });

  it('rejects token with invalid group', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'invalid.group',
          group: 'gradient',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects token with invalid type', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.type',
          group: 'color',
          type: 'gradient',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
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
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects empty tokens array', () => {
    expect(validateDoc({ schemaVersion: '1.0.0', tokens: [] })).toBe(false);
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
    expect(validateDoc(doc)).toBe(false);
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
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects empty tokenId', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: '',
          group: 'color',
          type: 'color',
          value: { space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 },
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects deprecated.replacedBy with invalid TokenId format', () => {
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
    expect(validateDoc(doc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Alias / deprecation / TokenValue discrimination
// ---------------------------------------------------------------------------

describe('P07 design-token-v1.schema.json — alias, deprecation, and value discrimination', () => {
  it('validates a TokenAlias instance individually', () => {
    const alias = { tokenId: 'color.brand.highlight', alias: 'color.brand.accent' };
    expect(validateTokenAlias(alias), JSON.stringify(validateTokenAlias.errors)).toBe(true);
  });

  it('validates a TokenDeprecated instance within a TokenDefinition', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [DEPRECATED_TOKEN],
    };
    expect(validateDoc(doc), JSON.stringify(validateDoc.errors)).toBe(true);
  });

  it('validates the deprecated token individually as TokenDefinition', () => {
    expect(validateTokenDef(DEPRECATED_TOKEN), JSON.stringify(validateTokenDef.errors)).toBe(true);
  });

  it('rejects a TokenValue with properties from two type discriminators (color + dimension)', () => {
    // A value that has both TokenColor fields (space, channels, alpha) and
    // TokenDimension fields (value, unit). Because every TokenValue branch
    // uses additionalProperties: false, this matches zero branches and
    // oneOf requires exactly one match — so it must fail.
    const ambiguousValue = {
      space: 'srgb',
      channels: [0.5, 0.5, 0.5],
      alpha: 1,
      value: 16,
      unit: 'px',
    };
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'ambiguous.token',
          group: 'color',
          type: 'color',
          value: ambiguousValue,
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });

  it('rejects a TokenAlias with a non-matching alias target (empty string)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      tokens: [
        {
          tokenId: 'color.bad.alias',
          alias: '',
        },
      ],
    };
    expect(validateDoc(doc)).toBe(false);
  });
});
