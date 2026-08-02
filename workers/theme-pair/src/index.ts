/**
 * @domio/theme-pair-worker — Phase 07 dark/light theme pair generator.
 *
 * Public API:
 *
 *  - {@link generateDarkTheme} — derive a dark-mode theme from a
 *    light-mode theme by inverting OKLCH lightness per color.
 *  - {@link generateLightTheme} — inverse direction.
 *  - {@link ThemePair}, {@link ThemeMode} — result shapes.
 *
 * The worker entry point is a thin NATS subscriber that publishes
 * the generated pair on `theme.pair.generated`.  In production the
 * `theme-service` subscribes to that subject and persists the
 * generated theme as a new kind of `kind: 'built-in'` theme.
 *
 * For the dev/in-process path the worker is a function: call
 * `generateDarkTheme` directly and forward the result.
 */

export * from './generator.js';
