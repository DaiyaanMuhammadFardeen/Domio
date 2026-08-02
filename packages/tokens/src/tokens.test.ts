/**
 * @domio/tokens — smoke tests.
 *
 * Verifies that the exported types compile and the TokenValue discriminated
 * union narrows correctly at the type level. Runtime checks are minimal;
 * this is primarily a compile-time contract test.
 */

import { describe, it, expect } from 'vitest';
import type {
  TokenColor,
  TokenDimension,
  TokenTypography,
  TokenShadow,
  TokenMotion,
  TokenContent,
  TokenValue,
  TokenDefinition,
  TokenAlias,
  TokenDeprecated,
  TokenResolved,
} from './index.js';
import { TokenGroup } from './index.js';

// ---------------------------------------------------------------------------
// Runtime: enum values
// ---------------------------------------------------------------------------

describe('TokenGroup enum', () => {
  it('has all 8 groups', () => {
    expect(Object.values(TokenGroup)).toEqual([
      'color',
      'typography',
      'spacing',
      'radius',
      'shadow',
      'motion',
      'content',
      'border',
    ]);
  });

  it('has exactly 8 members', () => {
    expect(Object.keys(TokenGroup)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// Runtime: construct valid token values
// ---------------------------------------------------------------------------

describe('TokenValue construction', () => {
  const colorValue: TokenColor = {
    space: 'srgb',
    channels: [0.5, 0.5, 0.5],
    alpha: 1,
  };

  const dimValue: TokenDimension = {
    value: 16,
    unit: 'px',
  };

  const typoValue: TokenTypography = {
    fontFamily: 'Inter',
    fontSize: { value: 16, unit: 'px' },
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: { value: 0, unit: 'px' },
    fallbackChain: ['Arial', 'sans-serif'],
  };

  const shadowValue: TokenShadow = {
    offsetX: { value: 0, unit: 'px' },
    offsetY: { value: 2, unit: 'px' },
    blur: { value: 4, unit: 'px' },
    spread: { value: 0, unit: 'px' },
    color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.25 },
  };

  const motionValue: TokenMotion = {
    duration: { value: 200, unit: 'ms' },
    easing: 'ease-out',
    delay: { value: 0, unit: 'ms' },
  };

  const contentValue: TokenContent = {
    contentType: 'text',
    data: 'Hello world',
  };

  it('color token narrows correctly', () => {
    const tv: TokenValue = { type: 'color', value: colorValue };
    expect(tv.type).toBe('color');
    if (tv.type === 'color') {
      expect(tv.value.space).toBe('srgb');
      expect(tv.value.channels).toHaveLength(3);
    }
  });

  it('dimension token narrows correctly', () => {
    const tv: TokenValue = { type: 'dimension', value: dimValue };
    expect(tv.type).toBe('dimension');
    if (tv.type === 'dimension') {
      expect(tv.value.unit).toBe('px');
    }
  });

  it('typography token narrows correctly', () => {
    const tv: TokenValue = { type: 'typography', value: typoValue };
    expect(tv.type).toBe('typography');
    if (tv.type === 'typography') {
      expect(tv.value.fontFamily).toBe('Inter');
      expect(tv.value.fallbackChain).toContain('Arial');
    }
  });

  it('shadow token narrows correctly', () => {
    const tv: TokenValue = { type: 'shadow', value: shadowValue };
    expect(tv.type).toBe('shadow');
    if (tv.type === 'shadow') {
      expect(tv.value.color.space).toBe('srgb');
    }
  });

  it('motion token narrows correctly', () => {
    const tv: TokenValue = { type: 'motion', value: motionValue };
    expect(tv.type).toBe('motion');
    if (tv.type === 'motion') {
      expect(tv.value.easing).toBe('ease-out');
      expect(tv.value.duration.unit).toBe('ms');
    }
  });

  it('content token narrows correctly', () => {
    const tv: TokenValue = { type: 'content', value: contentValue };
    expect(tv.type).toBe('content');
    if (tv.type === 'content') {
      expect(tv.value.contentType).toBe('text');
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime: TokenDefinition and TokenAlias shapes
// ---------------------------------------------------------------------------

describe('TokenDefinition', () => {
  it('constructs a valid definition', () => {
    const def: TokenDefinition = {
      tokenId: 'color.brand.primary',
      group: TokenGroup.Color,
      type: 'color',
      value: {
        type: 'color',
        value: { space: 'srgb', channels: [0.2, 0.4, 0.8], alpha: 1 },
      },
      description: 'Primary brand color',
      roles: ['brand', 'interactive'],
    };
    expect(def.tokenId).toBe('color.brand.primary');
    expect(def.group).toBe('color');
    expect(def.roles).toHaveLength(2);
  });

  it('allows optional fields to be absent', () => {
    const def: TokenDefinition = {
      tokenId: 'spacing.base',
      group: TokenGroup.Spacing,
      type: 'dimension',
      value: { type: 'dimension', value: { value: 8, unit: 'px' } },
    };
    expect(def.description).toBeUndefined();
    expect(def.roles).toBeUndefined();
    expect(def.deprecated).toBeUndefined();
  });
});

describe('TokenAlias', () => {
  it('constructs a valid alias', () => {
    const alias: TokenAlias = {
      aliasTokenId: 'color.brand.accent',
      targetTokenId: 'color.brand.primary',
    };
    expect(alias.aliasTokenId).toBe('color.brand.accent');
    expect(alias.targetTokenId).toBe('color.brand.primary');
  });
});

describe('TokenDeprecated', () => {
  it('constructs deprecation metadata', () => {
    const dep: TokenDeprecated = {
      replacedBy: 'color.brand.primary-v2',
      sinceVersion: '1.0.0',
    };
    expect(dep.replacedBy).toBe('color.brand.primary-v2');
    expect(dep.sinceVersion).toBe('1.0.0');
  });
});

describe('TokenResolved', () => {
  it('constructs a resolved token', () => {
    const resolved: TokenResolved = {
      tokenId: 'color.brand.primary',
      value: {
        type: 'color',
        value: { space: 'p3', channels: [0.3, 0.5, 0.7], alpha: 1 },
      },
      source: 'brand',
    };
    expect(resolved.source).toBe('brand');
    expect(resolved.value.type).toBe('color');
  });
});

// ---------------------------------------------------------------------------
// Type-level: exhaustive check helper (compile-time only)
// ---------------------------------------------------------------------------

describe('TokenValue exhaustive narrowing', () => {
  function exhaustCheck(v: TokenValue): string {
    switch (v.type) {
      case 'color':
        return `color:${v.value.space}`;
      case 'dimension':
        return `dim:${v.value.unit}`;
      case 'typography':
        return `typo:${v.value.fontFamily}`;
      case 'shadow':
        return `shadow`;
      case 'motion':
        return `motion:${v.value.easing}`;
      case 'content':
        return `content:${v.value.contentType}`;
    }
  }

  it('handles all branches', () => {
    const cases: TokenValue[] = [
      { type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
      { type: 'dimension', value: { value: 12, unit: 'rem' } },
      {
        type: 'typography',
        value: {
          fontFamily: 'Roboto',
          fontSize: { value: 14, unit: 'px' },
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: { value: 0.5, unit: 'px' },
          fallbackChain: ['Helvetica'],
        },
      },
      {
        type: 'shadow',
        value: {
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 1, unit: 'px' },
          blur: { value: 3, unit: 'px' },
          spread: { value: 0, unit: 'px' },
          color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 },
        },
      },
      { type: 'motion', value: { duration: { value: 300, unit: 'ms' }, easing: 'ease-in-out', delay: { value: 0, unit: 'ms' } } },
      { type: 'content', value: { contentType: 'svg', data: '<svg/>' } },
    ];

    for (const c of cases) {
      const result = exhaustCheck(c);
      expect(result).toBeTruthy();
    }
  });
});
