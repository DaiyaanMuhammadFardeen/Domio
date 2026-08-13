/**
 * @domio/tokens — Validation tests.
 */

import { describe, it, expect } from 'vitest';

import {
  validateTokenId,
  validateColor,
  validateDimension,
  validateTypography,
  validateShadow,
  validateMotion,
  validateContent,
  validateTokenValue,
  validateTokenDefinition,
  findTokenAliasCycle,
} from './validate.js';

describe('validateTokenId', () => {
  it('accepts dot-separated lowercase tokens', () => {
    expect(validateTokenId('color.brand.primary').valid).toBe(true);
    expect(validateTokenId('color.brand.500').valid).toBe(true);
    expect(validateTokenId('typography').valid).toBe(true);
  });

  it('rejects uppercase, dashes, leading dot, etc.', () => {
    expect(validateTokenId('Color.brand.primary').valid).toBe(false);
    expect(validateTokenId('color-brand-primary').valid).toBe(false);
    expect(validateTokenId('.color.brand').valid).toBe(false);
    expect(validateTokenId('color..brand').valid).toBe(false);
    expect(validateTokenId('color.brand.primary ').valid).toBe(false);
  });
});

describe('validateColor', () => {
  it('accepts a valid color', () => {
    const result = validateColor({ space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1 });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid space', () => {
    const result = validateColor({ space: 'cmyk', channels: [0, 0, 0, 0], alpha: 1 });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('COLOR_SPACE');
  });

  it('rejects wrong channel count', () => {
    const result = validateColor({ space: 'srgb', channels: [0.5, 0.5], alpha: 1 });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('CHANNELS_LENGTH');
  });

  it('rejects out-of-range channels', () => {
    const result = validateColor({ space: 'srgb', channels: [0.5, 1.5, 0.5], alpha: 1 });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('CHANNEL_RANGE');
  });

  it('rejects out-of-range alpha', () => {
    const result = validateColor({ space: 'srgb', channels: [0.5, 0.5, 0.5], alpha: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('ALPHA_RANGE');
  });
});

describe('validateDimension', () => {
  it('accepts px', () => {
    expect(validateDimension({ value: 16, unit: 'px' }).valid).toBe(true);
  });

  it('accepts rem', () => {
    expect(validateDimension({ value: 1, unit: 'rem' }).valid).toBe(true);
  });

  it('rejects unknown units', () => {
    expect(validateDimension({ value: 16, unit: 'pt' }).valid).toBe(false);
  });
});

describe('validateTypography', () => {
  it('accepts a valid typography', () => {
    const result = validateTypography({
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: ['system-ui', 'sans-serif'],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing fontFamily', () => {
    const result = validateTypography({
      fontFamily: '',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: [],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'TYPOGRAPHY_FAMILY')).toBe(true);
  });

  it('rejects invalid weight', () => {
    const result = validateTypography({
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 1000,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
      fallbackChain: [],
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateShadow', () => {
  it('accepts a valid shadow', () => {
    const result = validateShadow({
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 4, unit: 'px' },
      blur: { value: 8, unit: 'px' },
      spread: { value: 0, unit: 'px' },
      color: { space: 'srgb', channels: [0, 0, 0], alpha: 0.1 },
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateMotion', () => {
  it('accepts a valid motion', () => {
    const result = validateMotion({
      duration: { value: 200, unit: 'ms' },
      delay: { value: 0, unit: 'ms' },
      easing: 'ease-in-out',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown easing', () => {
    const result = validateMotion({
      duration: { value: 200, unit: 'ms' },
      delay: { value: 0, unit: 'ms' },
      easing: 'bouncy',
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateContent', () => {
  it('accepts a text content', () => {
    expect(validateContent({ contentType: 'text', data: 'Hello' }).valid).toBe(true);
  });

  it('rejects unknown contentType', () => {
    expect(validateContent({ contentType: 'video', data: '...' }).valid).toBe(false);
  });
});

describe('validateTokenValue (discriminated union)', () => {
  it('routes by type', () => {
    expect(
      validateTokenValue({ type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 } })
        .valid,
    ).toBe(true);
    expect(validateTokenValue({ type: 'dimension', value: { value: 8, unit: 'px' } }).valid).toBe(
      true,
    );
    expect(
      validateTokenValue({
        type: 'motion',
        value: {
          duration: { value: 100, unit: 'ms' },
          delay: { value: 0, unit: 'ms' },
          easing: 'linear',
        },
      }).valid,
    ).toBe(true);
  });

  it('rejects unknown type', () => {
    const result = validateTokenValue({ type: 'gradient', value: {} });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('UNKNOWN_TYPE');
  });

  it('rejects non-objects', () => {
    expect(validateTokenValue(null).valid).toBe(false);
    expect(validateTokenValue(42).valid).toBe(false);
    expect(validateTokenValue('not-a-token').valid).toBe(false);
  });
});

describe('validateTokenDefinition', () => {
  it('accepts a valid token', () => {
    const result = validateTokenDefinition({
      tokenId: 'color.brand.primary',
      value: { type: 'color', value: { space: 'srgb', channels: [0, 0, 1], alpha: 1 } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing tokenId', () => {
    const result = validateTokenDefinition({
      value: { type: 'color', value: { space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
    });
    expect(result.valid).toBe(false);
  });
});

describe('findTokenAliasCycle', () => {
  it('returns null for linear chains', () => {
    expect(
      findTokenAliasCycle('a', [
        { aliasTokenId: 'a', targetTokenId: 'b' },
        { aliasTokenId: 'b', targetTokenId: 'c' },
      ]),
    ).toBeNull();
  });

  it('returns null for disconnected chains', () => {
    expect(
      findTokenAliasCycle('a', [
        { aliasTokenId: 'a', targetTokenId: 'b' },
        { aliasTokenId: 'x', targetTokenId: 'y' },
      ]),
    ).toBeNull();
  });

  it('detects a self-loop', () => {
    const cycle = findTokenAliasCycle('a', [{ aliasTokenId: 'a', targetTokenId: 'a' }]);
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(['a', 'a']);
  });

  it('detects a 2-cycle', () => {
    const cycle = findTokenAliasCycle('a', [
      { aliasTokenId: 'a', targetTokenId: 'b' },
      { aliasTokenId: 'b', targetTokenId: 'a' },
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(['a', 'b', 'a']);
  });

  it('detects a 3-cycle', () => {
    const cycle = findTokenAliasCycle('a', [
      { aliasTokenId: 'a', targetTokenId: 'b' },
      { aliasTokenId: 'b', targetTokenId: 'c' },
      { aliasTokenId: 'c', targetTokenId: 'a' },
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(['a', 'b', 'c', 'a']);
  });
});
