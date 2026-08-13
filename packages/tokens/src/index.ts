/**
 * @domio/tokens — Canonical design token types for Phase 07.
 *
 * This is the single source of truth for token shapes consumed by
 * @domio/theme, @domio/ui, and any downstream package. No runtime
 * dependencies — types only.
 *
 * ⚠️  Keep in sync with contracts/schema/v1/design-token-v1.schema.json.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** The eight design token groups. */
export enum TokenGroup {
  Color = 'color',
  Typography = 'typography',
  Spacing = 'spacing',
  Radius = 'radius',
  Shadow = 'shadow',
  Motion = 'motion',
  Content = 'content',
  Border = 'border',
}

/** String literal union of all token group values. */
export type TokenType = 'color' | 'dimension' | 'typography' | 'shadow' | 'motion' | 'content';

/** Roles a token can serve. */
export type TokenRole = 'interactive' | 'brand' | 'content' | 'decorative';

/** Resolution source for a resolved token. */
export type TokenResolvedSource =
  | 'override'
  | 'theme'
  | 'brand'
  | 'org'
  | 'alias'
  | 'platform-fallback'
  | 'system-alias';

// ---------------------------------------------------------------------------
// Value shapes (discriminated by TokenValue.type)
// ---------------------------------------------------------------------------

/** Color token value in a specific color space with channel values. */
export interface TokenColor {
  /** Color space: 'srgb' or 'p3' (display-p3). */
  readonly space: 'srgb' | 'p3';
  /** Red, green, blue channels as 0–1 floats. */
  readonly channels: readonly [number, number, number];
  /** Alpha (opacity) as 0–1. */
  readonly alpha: number;
}

/** Dimension token value with unit. */
export interface TokenDimension {
  readonly value: number;
  readonly unit: 'px' | 'rem' | 'em' | '%';
}

/** Time duration token value (used by motion). */
export interface TokenTimeDuration {
  readonly value: number;
  readonly unit: 'ms' | 's';
}

/** Typography token value. */
export interface TokenTypography {
  /** Primary font family name. */
  readonly fontFamily: string;
  /** Font size as a dimension. */
  readonly fontSize: TokenDimension;
  /** Font weight (100–900). */
  readonly fontWeight: number;
  /** Line height as a unitless multiplier (e.g., 1.5). */
  readonly lineHeight: number;
  /** Letter spacing as a dimension. */
  readonly letterSpacing: TokenDimension;
  /** Ordered fallback font families if primary is unavailable. */
  readonly fallbackChain: readonly string[];
}

/** Shadow token value with offset, blur, spread, and color. */
export interface TokenShadow {
  readonly offsetX: TokenDimension;
  readonly offsetY: TokenDimension;
  readonly blur: TokenDimension;
  readonly spread: TokenDimension;
  readonly color: TokenColor;
}

/** Motion/animation token value. */
export interface TokenMotion {
  readonly duration: TokenTimeDuration;
  readonly easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
  readonly delay: TokenTimeDuration;
}

/** Content token value (inline text, icon, image, svg, lottie). */
export interface TokenContent {
  readonly contentType: 'text' | 'icon' | 'image' | 'svg' | 'lottie';
  readonly data: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all token value types.
 * Discriminant field is `type`.
 */
export type TokenValue =
  | { readonly type: 'color'; readonly value: TokenColor }
  | { readonly type: 'dimension'; readonly value: TokenDimension }
  | { readonly type: 'typography'; readonly value: TokenTypography }
  | { readonly type: 'shadow'; readonly value: TokenShadow }
  | { readonly type: 'motion'; readonly value: TokenMotion }
  | { readonly type: 'content'; readonly value: TokenContent };

// ---------------------------------------------------------------------------
// Token definition & alias
// ---------------------------------------------------------------------------

/** Deprecation metadata for a token. */
export interface TokenDeprecated {
  /** Token ID that replaces this one. */
  readonly replacedBy: string;
  /** Semver version at which this token was deprecated. */
  readonly sinceVersion: string;
}

/** A concrete design token definition. */
export interface TokenDefinition {
  /** Stable dot-separated token ID, e.g., 'color.brand.primary'. */
  readonly tokenId: string;
  /** Which group this token belongs to. */
  readonly group: TokenGroup;
  /** The value type (discriminant for the value field). */
  readonly type: TokenType;
  /** The token's concrete value. */
  readonly value: TokenValue;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Optional roles this token serves. */
  readonly roles?: readonly TokenRole[];
  /** Optional deprecation metadata. */
  readonly deprecated?: TokenDeprecated;
}

/** An alias that maps one token ID to another. */
export interface TokenAlias {
  /** The alias token's own ID. */
  readonly aliasTokenId: string;
  /** The target token ID this alias resolves to. */
  readonly targetTokenId: string;
}

// ---------------------------------------------------------------------------
// Resolved token
// ---------------------------------------------------------------------------

/** A fully-resolved token with its source layer. */
export interface TokenResolved {
  /** The token ID that was resolved. */
  readonly tokenId: string;
  /** The resolved concrete value. */
  readonly value: TokenValue;
  /** Which precedence layer this value came from. */
  readonly source: TokenResolvedSource;
}

// Re-export color space helpers
export {
  srgbToLinear,
  linearToSrgb,
  linearSrgbToOklab,
  oklabToLinearSrgb,
  oklabToOklch,
  oklchToOklab,
  srgbToOklch,
  oklchToSrgb,
  hexToOklch,
  oklchToHex,
  clampToGamut,
  deltaEOklch,
  wcagContrast,
  apcaContrast,
} from './color-spaces.js';
export type { SrgbChannel } from './color-spaces.js';

// Re-export validation helpers
export {
  validateTokenValue,
  validateTokenId,
  validateTokenDefinition,
  validateColor,
  validateDimension,
  validateTypography,
  validateShadow,
  validateMotion,
  validateContent,
  findTokenAliasCycle,
} from './validate.js';
export type { ValidationIssue, ValidationResult } from './validate.js';
