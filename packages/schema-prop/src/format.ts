/**
 * Format extensions — validators for the Domio prop formats declared in
 * docs/components-templates.md §4.2: `color`, `color-with-alpha`,
 * `font-family`, `asset-ref`, `data-binding`, `enum-friendly-name`.
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_FN = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
const HSL_FN =
  /^hsla?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
const NAMED_COLORS = new Set([
  'transparent', 'black', 'white', 'red', 'green', 'blue', 'gray', 'grey',
  'orange', 'yellow', 'purple', 'pink', 'cyan', 'magenta', 'brown', 'navy',
  'teal', 'lime', 'gold', 'silver', 'maroon', 'olive', 'violet', 'indigo',
]);

/** Validates a CSS color string in the Domio working set. */
export function isColor(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  if (HEX_COLOR.test(v)) return true;
  if (RGB_FN.test(v)) return true;
  if (HSL_FN.test(v)) return true;
  if (v === 'currentcolor') return true;
  if (NAMED_COLORS.has(v)) return true;
  // token reference (theme.tokens.*)
  return /^token:[\w.-]+$/.test(v);
}

/** color-with-alpha: same as color, but the alpha channel must be present. */
export function isColorWithAlpha(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!isColor(value)) return false;
  const v = value.trim().toLowerCase();
  return /#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})/.test(v) || /rgba?\(/.test(v) || /hsla?\(/.test(v);
}

/** font-family: comma-separated family list or a token reference. */
export function isFontFamily(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 120) return false;
  if (/^token:[\w.-]+$/.test(v)) return true;
  return v.split(',').every((part) => part.trim().length > 0);
}

/** asset-ref: a resource reference `{kind}/{id}` or a token reference. */
export function isAssetRef(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 300) return false;
  if (/^token:[\w.-]+$/.test(v)) return true;
  // kind/id, kind:id, or a ULID alone (user library asset)
  return /^[a-zA-Z0-9_-]+[/:][a-zA-Z0-9._-]+$/.test(v) || /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);
}

/** data-binding: a { source, path } object or a string ref. */
export function isDataBinding(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.source !== 'string' || v.source.length === 0) return false;
  return v.path === undefined || typeof v.path === 'string';
}

/** enum-friendly-name: human readable, printable characters. */
export function isEnumFriendlyName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 80) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

export type DomioFormat =
  | 'color'
  | 'color-with-alpha'
  | 'font-family'
  | 'asset-ref'
  | 'data-binding'
  | 'enum-friendly-name';

export const FORMAT_VALIDATORS: Record<DomioFormat, (value: unknown) => boolean> = {
  color: isColor,
  'color-with-alpha': isColorWithAlpha,
  'font-family': isFontFamily,
  'asset-ref': isAssetRef,
  'data-binding': isDataBinding,
  'enum-friendly-name': isEnumFriendlyName,
};

/** Returns the Domio format name when the fragment's format is recognized. */
export function domioFormat(format: string | undefined): DomioFormat | null {
  if (!format) return null;
  if (format in FORMAT_VALIDATORS) return format as DomioFormat;
  return null;
}
