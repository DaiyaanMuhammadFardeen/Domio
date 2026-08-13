/**
 * cn — class-name joiner.
 *
 * Filter falsy values (undefined / null / false / '' / 0). String values
 * are kept as-is; objects are kept if their value is truthy.
 *
 * This is intentionally dependency-free (no `clsx` import) so `@domio/ui`
 * remains zero-runtime-cost for SSR.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | true
  | ClassValue[]
  | { [key: string]: unknown };

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      out.push(input);
    } else if (typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const inner = cn(...input);
      if (inner) out.push(inner);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key);
      }
    }
  }
  return out.join(' ');
}
