/**
 * Localization service client — bootstrap seam.
 *
 * Per Wave 2 §S2.9 of docs/frontend-roadmap/02-wave-editor-surface.md:
 *   "Per-element locale picker + unit format dialog"
 *
 * The real implementation would POST to /v1/localization/format
 * (services/localization). Until the backend is wired, this module
 * ships a thin client that calls `Intl.NumberFormat` for live
 * previews so the editor surface is usable in editor-only mode.
 *
 * NOT-YET-IMPLEMENTED: replace `formatPreview()` with a real
 * fetch to `services/localization` once the runtime transport is
 * available. The client signature is intentionally identical so
 * the UI does not need to change.
 */

export type FormatStyle = 'decimal' | 'currency' | 'percent';

export interface FormatPreviewRequest {
  value: number;
  locale: string;
  style?: FormatStyle;
  currency?: string;
  decimals?: number;
}

export interface FormatPreviewResult {
  /** The formatted string ready to drop into the UI. */
  formatted: string;
  /** True when the live service is unreachable and the local fallback formatted the value. */
  fallback: boolean;
  /** The locale actually used (after fallback resolution). */
  effectiveLocale: string;
}

/** A short list of well-supported locales for the picker UI. */
export const SUPPORTED_LOCALES: readonly string[] = [
  'en-US',
  'en-GB',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'ja-JP',
  'zh-CN',
  'ko-KR',
  'ar-EG',
  'bn-BD',
  'ur-PK',
  'hi-IN',
];

export const SUPPORTED_CURRENCIES: readonly string[] = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
  'KRW',
  'INR',
  'BDT',
  'PKR',
  'AUD',
  'CAD',
  'BRL',
  'AED',
  'SAR',
];

/**
 * Format a preview value for the editor UI.
 *
 * Returns `{ formatted, fallback: true }` while the live service is
 * not yet wired. The contract matches the backend response shape
 * (`{ formatted }`) so swapping the implementation is a single-line
 * change inside this function.
 */
export async function formatPreview(req: FormatPreviewRequest): Promise<FormatPreviewResult> {
  return formatPreviewSync(req);
}

/**
 * Synchronous variant for previews that must render in the same paint
 * pass (the unit format dialog's preview tile). Same fallback
 * behaviour as the async path.
 */
export function formatPreviewSync(req: FormatPreviewRequest): FormatPreviewResult {
  const requested = req.locale || 'en-US';
  try {
    const opts: Intl.NumberFormatOptions = {
      style: req.style ?? 'decimal',
      ...(req.style === 'currency' && req.currency ? { currency: req.currency } : {}),
      ...(req.decimals !== undefined ? { maximumFractionDigits: req.decimals, minimumFractionDigits: req.decimals } : {}),
    };
    const formatter = new Intl.NumberFormat(requested, opts);
    return {
      formatted: formatter.format(req.value),
      fallback: true,
      effectiveLocale: formatter.resolvedOptions().locale,
    };
  } catch {
    const formatter = new Intl.NumberFormat('en-US', {
      style: req.style ?? 'decimal',
      ...(req.style === 'currency' && req.currency ? { currency: req.currency } : {}),
    });
    return {
      formatted: formatter.format(req.value),
      fallback: true,
      effectiveLocale: formatter.resolvedOptions().locale,
    };
  }
}