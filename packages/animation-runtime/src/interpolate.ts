/**
 * @domio/animation-runtime — Pure interpolation functions.
 *
 * Supports: numbers, hex colors (#rgb, #rrggbb, #rrggbbaa),
 * rgb()/rgba() strings, and string-with-number (e.g. "translate(10px, 20px)").
 */

/** Attempt to parse a color string into [r, g, b, a] (0-255, 0-1). */
function parseColor(s: string): [number, number, number, number] | null {
  const hex = s.trim();
  // #rgb
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    const c1 = hex[1] ?? '0';
    const c2 = hex[2] ?? '0';
    const c3 = hex[3] ?? '0';
    const r = parseInt(c1 + c1, 16);
    const g = parseInt(c2 + c2, 16);
    const b = parseInt(c3 + c3, 16);
    return [r, g, b, 1];
  }
  // #rrggbb
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 1];
  }
  // #rrggbbaa
  if (/^#([0-9a-fA-F]{8})$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = parseInt(hex.slice(7, 9), 16) / 255;
    return [r, g, b, a];
  }
  // rgb(r, g, b)
  const rgbMatch = hex.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/,
  );
  if (rgbMatch) {
    const r = Math.min(255, Number(rgbMatch[1] ?? '0'));
    const g = Math.min(255, Number(rgbMatch[2] ?? '0'));
    const b = Math.min(255, Number(rgbMatch[3] ?? '0'));
    const a = rgbMatch[4] !== undefined ? Math.min(1, Number(rgbMatch[4])) : 1;
    return [r, g, b, a];
  }
  return null;
}

function toHex2(n: number): string {
  const h = Math.round(Math.min(255, Math.max(0, n))).toString(16);
  return h.length === 1 ? '0' + h : h;
}

function formatColor(c: [number, number, number, number]): string {
  if (c[3] === 1) {
    return `#${toHex2(c[0])}${toHex2(c[1])}${toHex2(c[2])}`;
  }
  return `#${toHex2(c[0])}${toHex2(c[1])}${toHex2(c[2])}${toHex2(c[3] * 255)}`;
}

/** Interpolate a string with numeric values (e.g. "translate(10px, 20px)"). */
function interpolateStringWithNumbers(a: string, b: string, t: number): string {
  // Extract all numbers from both strings
  const numRe = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const aNums = (a.match(numRe) ?? []).map(Number);
  const bNums = (b.match(numRe) ?? []).map(Number);

  if (aNums.length === 0 || aNums.length !== bNums.length) {
    // Cannot interpolate — return b as-is (step behavior)
    return b;
  }

  let ai = 0;
  return a.replace(numRe, () => {
    const aVal = aNums[ai] as number;
    const bVal = bNums[ai] as number;
    const val = aVal + (bVal - aVal) * t;
    ai++;
    // Preserve original formatting precision
    return String(Math.round(val * 1000) / 1000);
  });
}

/**
 * Interpolate between two values.
 *
 * - Numbers: linear lerp.
 * - Colors (hex / rgb / rgba): per-channel lerp.
 * - Strings with numeric parts: interpolate the numeric parts.
 * - Fallback: step (return b when t >= 0.5).
 */
export function interpolate(a: number | string, b: number | string, t: number): number | string {
  // Both numbers — linear lerp
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }

  // Both strings — try color interpolation first
  if (typeof a === 'string' && typeof b === 'string') {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (ca && cb) {
      return formatColor([
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
        ca[3] + (cb[3] - ca[3]) * t,
      ]);
    }

    // Try string-with-numbers
    return interpolateStringWithNumbers(a, b, t);
  }

  // Mixed types — step
  return t >= 0.5 ? b : a;
}
