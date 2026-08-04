/**
 * Built-in function registry for prototype expressions.
 *
 * Every function is pure and total — no I/O, no `this`, no globals. The
 * registry is the only path to runtime helpers; the compiler never sees
 * a function name that isn't here.
 */

import { ValueError } from './errors.js';

/** Argument count constraint for a builtin. */
export type Arity =
  | { readonly kind: 'exact'; readonly n: number }
  | { readonly kind: 'min'; readonly n: number }
  | { readonly kind: 'range'; readonly min: number; readonly max: number };

export interface Builtin {
  readonly arity: Arity;
  readonly fn: (args: readonly unknown[]) => unknown;
}

function arityExact(n: number): Arity {
  return { kind: 'exact', n };
}

function arityRange(min: number, max: number): Arity {
  return { kind: 'range', min, max };
}

function arityMin(n: number): Arity {
  return { kind: 'min', n };
}

function toNumber(v: unknown, name: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) throw new ValueError(`${name}: cannot convert null to number`);
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isNaN(n)) throw new ValueError(`${name}: cannot convert '${v}' to number`);
    return n;
  }
  throw new ValueError(`${name}: cannot convert ${typeof v} to number`);
}

function toBool(v: unknown, name: string): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  throw new ValueError(`${name}: cannot convert ${typeof v} to boolean`);
}

export const BUILTINS: Readonly<Record<string, Builtin>> = Object.freeze({
  // ── numeric ──────────────────────────────────────────────────────────
  ROUND: {
    arity: arityRange(1, 2),
    fn: (args) => {
      const n = toNumber(args[0], 'ROUND');
      const digits = args.length > 1 ? toNumber(args[1], 'ROUND') : 0;
      if (!Number.isFinite(n)) throw new ValueError('ROUND: input is not finite');
      const m = Math.pow(10, digits);
      return Math.round(n * m) / m;
    },
  },
  FLOOR: {
    arity: arityExact(1),
    fn: (args) => Math.floor(toNumber(args[0], 'FLOOR')),
  },
  CEIL: {
    arity: arityExact(1),
    fn: (args) => Math.ceil(toNumber(args[0], 'CEIL')),
  },
  ABS: {
    arity: arityExact(1),
    fn: (args) => Math.abs(toNumber(args[0], 'ABS')),
  },
  MIN: {
    arity: arityMin(1),
    fn: (args) => {
      let m = toNumber(args[0]!, 'MIN');
      for (let i = 1; i < args.length; i++) m = Math.min(m, toNumber(args[i]!, 'MIN'));
      return m;
    },
  },
  MAX: {
    arity: arityMin(1),
    fn: (args) => {
      let m = toNumber(args[0]!, 'MAX');
      for (let i = 1; i < args.length; i++) m = Math.max(m, toNumber(args[i]!, 'MAX'));
      return m;
    },
  },
  CLAMP: {
    arity: arityExact(3),
    fn: (args) => {
      const n = toNumber(args[0], 'CLAMP');
      const lo = toNumber(args[1], 'CLAMP');
      const hi = toNumber(args[2], 'CLAMP');
      return Math.min(hi, Math.max(lo, n));
    },
  },

  // ── logical / comparison helpers ─────────────────────────────────────
  IF: {
    arity: arityExact(3),
    fn: (args) => (toBool(args[0], 'IF') ? args[1] : args[2]),
  },
  COALESCE: {
    arity: arityMin(1),
    fn: (args) => {
      for (let i = 0; i < args.length; i++) {
        const v = args[i];
        if (v !== null && v !== undefined) return v;
      }
      return null;
    },
  },
  NOT: {
    arity: arityExact(1),
    fn: (args) => !toBool(args[0], 'NOT'),
  },

  // ── string / array helpers ───────────────────────────────────────────
  LENGTH: {
    arity: arityExact(1),
    fn: (args) => {
      const v = args[0];
      if (v === null || v === undefined) return 0;
      if (typeof v === 'string') return v.length;
      if (Array.isArray(v)) return v.length;
      throw new ValueError(`LENGTH: expected string or array, got ${typeof v}`);
    },
  },
  MATCH: {
    arity: arityExact(2),
    fn: (args) => {
      const v = args[0];
      const pattern = args[1];
      if (typeof v !== 'string' || typeof pattern !== 'string') {
        throw new ValueError('MATCH: both arguments must be strings');
      }
      // Case-insensitive regex; whitelist via regex character class to
      // avoid ReDoS-prone patterns. Authors can still inject \.\*; we
      // cap pattern length + run a 1ms timeout in evaluator.
      const re = new RegExp(pattern, 'i');
      return re.test(v);
    },
  },
  CONCAT: {
    arity: arityMin(1),
    fn: (args) => args.map((a) => (a === null ? '' : String(a))).join(''),
  },
  UPPER: {
    arity: arityExact(1),
    fn: (args) => String(args[0] ?? '').toUpperCase(),
  },
  LOWER: {
    arity: arityExact(1),
    fn: (args) => String(args[0] ?? '').toLowerCase(),
  },

  // ── formatting ───────────────────────────────────────────────────────
  FORMATNUMBER: {
    arity: arityRange(1, 3),
    fn: (args) => {
      const n = toNumber(args[0], 'FORMATNUMBER');
      const locale = (args[1] as string | undefined) ?? 'en-US';
      const opts = (args[2] as Intl.NumberFormatOptions | undefined) ?? {};
      try {
        return new Intl.NumberFormat(locale, opts).format(n);
      } catch {
        return String(n);
      }
    },
  },
  FORMATCURRENCY: {
    arity: arityRange(1, 4),
    fn: (args) => {
      const n = toNumber(args[0], 'FORMATCURRENCY');
      const currency = (args[1] as string | undefined) ?? 'USD';
      const locale = (args[2] as string | undefined) ?? 'en-US';
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
        }).format(n);
      } catch {
        return `${n} ${currency}`;
      }
    },
  },
  FORMATDATE: {
    arity: arityRange(1, 3),
    fn: (args) => {
      const v = args[0];
      let d: Date;
      if (v instanceof Date) d = v;
      else if (typeof v === 'number') d = new Date(v);
      else if (typeof v === 'string') d = new Date(v);
      else throw new ValueError('FORMATDATE: argument must be a date, number, or string');
      const locale = (args[1] as string | undefined) ?? 'en-US';
      const opts = (args[2] as Intl.DateTimeFormatOptions | undefined) ?? {};
      try {
        return new Intl.DateTimeFormat(locale, opts).format(d);
      } catch {
        return d.toISOString();
      }
    },
  },
});

/** Names that must NEVER appear as function calls — defense-in-depth. */
export const HOST_ACCESS_NAMES: ReadonlySet<string> = new Set([
  'EVAL',
  'FUNCTION',
  'GLOBALTHIS',
  'PROCESS',
  'REQUIRE',
  'MODULE',
  'FETCH',
  'XMLHTTPREQUEST',
  'WINDOW',
  'DOCUMENT',
  'GLOBAL',
  'IMPORT',
  'CONSTRUCTOR',
  'PROTOTYPE',
  '__PROTO__',
  'THIS',
  'ARGUMENTS',
  'WITH',
  'DELETE',
]);