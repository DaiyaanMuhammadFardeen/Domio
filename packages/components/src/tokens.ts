/**
 * Variant token sets — light/dark palettes that component builders consume.
 * `accent` is a per-instance prop; everything else comes from the variant.
 */

export interface VariantTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}

const LIGHT: Omit<VariantTokens, 'accent'> = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
};

const DARK: Omit<VariantTokens, 'accent'> = {
  background: '#0F172A',
  surface: '#1E293B',
  text: '#F8FAFC',
  muted: '#94A3B8',
  border: '#334155',
};

/** Default accent used when the instance omits the accent prop. */
export const DEFAULT_ACCENT = '#4F46E5';

export function tokensFor(variantId: string, accent?: string): VariantTokens {
  const base = variantId === 'dark' ? DARK : LIGHT;
  return {
    ...base,
    accent: accent && isHexColor(accent) ? accent : DEFAULT_ACCENT,
  };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value) || /^#[0-9a-fA-F]{8}$/.test(value);
}
