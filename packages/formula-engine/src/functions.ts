/**
 * Built-in formula functions.
 */

import { FormulaError } from './errors.js';

/** A formula value. */
export type Value = number | string | boolean | null;

/** Extended value that may include Date objects (internal only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InternalValue = Value | Date | any[];

/** Evaluation context passed to functions. */
export interface EvalContext {
  fields: Record<string, Value | Value[]>;
  ranges?: Record<string, Value[]>;
  functions?: Record<string, FormulaFn>;
  now?: Date;
  seed?: number;
  version: number;
}

/** Formula function signature. */
export type FormulaFn = (args: Value[], ctx: EvalContext) => Value;

// ── helpers ──────────────────────────────────────────────

/** Safely access an argument by index. */
function arg(args: Value[], i: number): Value {
  const v = args[i];
  return v === undefined ? null : v;
}

function toNumber(v: Value): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function coerceNumber(v: Value): number {
  if (v === null) throw new FormulaError('#VALUE!', 'Value is null');
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (isNaN(n)) throw new FormulaError('#VALUE!', `Cannot convert '${v}' to number`);
  return n;
}

function isTruthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return false;
}

/** Flatten arguments (ranges become individual values). */
function flatten(args: Value[]): number[] {
  const result: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const v of a) {
        result.push(toNumber(v));
      }
    } else {
      result.push(toNumber(a));
    }
  }
  return result;
}

function flattenValues(args: Value[]): Value[] {
  const result: Value[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const v of a) {
        result.push(v as Value);
      }
    } else {
      result.push(a);
    }
  }
  return result;
}

function toValueArray(v: Value): Value[] {
  if (Array.isArray(v)) return v.map((x) => x as Value);
  return [v];
}

// ── criteria matching ────────────────────────────────────

function matchCriteria(value: Value, criteria: string): boolean {
  if (criteria === '' || criteria === null || criteria === undefined) return true;

  const s = String(criteria).trim();

  if (s.startsWith('>=')) return toNumber(value) >= toNumber(s.slice(2));
  if (s.startsWith('<=')) return toNumber(value) <= toNumber(s.slice(2));
  if (s.startsWith('<>')) return String(value) !== s.slice(2);
  if (s.startsWith('>')) return toNumber(value) > toNumber(s.slice(1));
  if (s.startsWith('<')) return toNumber(value) < toNumber(s.slice(1));
  if (s.startsWith('=')) return String(value) === s.slice(1);

  // Wildcard: * matches any, ? matches single char
  if (s.includes('*') || s.includes('?')) {
    const pattern = '^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(pattern, 'i').test(String(value));
  }

  return String(value) === s;
}

// ── seeded PRNG ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── function registry ────────────────────────────────────

export const FUNCTIONS: Record<string, FormulaFn> = {
  // ── Math ─────────────────────────────────────────────

  SUM: (args) => {
    const nums = flatten(args);
    return nums.reduce((a, b) => a + b, 0);
  },

  PRODUCT: (args) => {
    const nums = flatten(args);
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a * b, 1);
  },

  ABS: (args) => Math.abs(coerceNumber(arg(args, 0))),

  ROUND: (args) => {
    const num = coerceNumber(arg(args, 0));
    const digits = args[1] !== undefined ? coerceNumber(args[1]) : 0;
    const factor = 10 ** digits;
    return Math.round(num * factor) / factor;
  },

  ROUNDUP: (args) => {
    const num = coerceNumber(arg(args, 0));
    const digits = args[1] !== undefined ? coerceNumber(args[1]) : 0;
    const factor = 10 ** digits;
    return Math.ceil(num * factor) / factor;
  },

  ROUNDDOWN: (args) => {
    const num = coerceNumber(arg(args, 0));
    const digits = args[1] !== undefined ? coerceNumber(args[1]) : 0;
    const factor = 10 ** digits;
    return Math.floor(num * factor) / factor;
  },

  INT: (args) => Math.floor(coerceNumber(arg(args, 0))),

  MOD: (args) => {
    const n = coerceNumber(arg(args, 0));
    const d = coerceNumber(arg(args, 1));
    if (d === 0) throw new FormulaError('#DIV/0!', 'Division by zero');
    return n - d * Math.floor(n / d);
  },

  POWER: (args) => Math.pow(coerceNumber(arg(args, 0)), coerceNumber(arg(args, 1))),

  SQRT: (args) => {
    const n = coerceNumber(arg(args, 0));
    if (n < 0) throw new FormulaError('#NUM!', 'Square root of negative number');
    return Math.sqrt(n);
  },

  MIN: (args) => {
    const nums = flatten(args).filter((n) => !isNaN(n));
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  },

  MAX: (args) => {
    const nums = flatten(args).filter((n) => !isNaN(n));
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  },

  RAND: (_args, ctx) => {
    const seed = ctx.seed ?? 1;
    const rng = mulberry32(seed);
    return rng();
  },

  RANDBETWEEN: (args, ctx) => {
    const low = Math.ceil(coerceNumber(arg(args, 0)));
    const high = Math.floor(coerceNumber(arg(args, 1)));
    const seed = ctx.seed ?? 1;
    const rng = mulberry32(seed);
    return low + Math.floor(rng() * (high - low + 1));
  },

  // ── Statistical ──────────────────────────────────────

  AVERAGE: (args) => {
    const nums = flatten(args);
    if (nums.length === 0) throw new FormulaError('#DIV/0!', 'Average of empty set');
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },

  COUNT: (args) => {
    let count = 0;
    for (const a of args) {
      if (Array.isArray(a)) {
        for (const v of a) {
          if (typeof v === 'number') count++;
        }
      } else if (typeof a === 'number') {
        count++;
      }
    }
    return count;
  },

  COUNTA: (args) => {
    let count = 0;
    const vals = flattenValues(args);
    for (const v of vals) {
      if (v !== null) count++;
    }
    return count;
  },

  COUNTBLANK: (args) => {
    let count = 0;
    const vals = flattenValues(args);
    for (const v of vals) {
      if (v === null || (typeof v === 'string' && v === '')) count++;
    }
    return count;
  },

  COUNTIF: (args) => {
    const range = arg(args, 0);
    const criteria = String(args[1] ?? '');
    const vals = toValueArray(range);
    let count = 0;
    for (const v of vals) {
      if (matchCriteria(v, criteria)) count++;
    }
    return count;
  },

  COUNTIFS: (args) => {
    if (args.length < 2 || args.length % 2 !== 0) {
      throw new FormulaError('#VALUE!', 'COUNTIFS requires pairs of range/criteria');
    }
    const pairs: { range: Value[]; criteria: string }[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const range = args[i]!;
      const criteria = String(args[i + 1] ?? '');
      pairs.push({
        range: toValueArray(range),
        criteria,
      });
    }
    const len = pairs[0]!.range.length;
    let count = 0;
    for (let i = 0; i < len; i++) {
      let match = true;
      for (const p of pairs) {
        const v = p.range[i];
        if (v === undefined || !matchCriteria(v, p.criteria)) {
          match = false;
          break;
        }
      }
      if (match) count++;
    }
    return count;
  },

  SUMIF: (args) => {
    const range = arg(args, 0);
    const criteria = String(args[1] ?? '');
    const sumRange = args.length > 2 ? args[2]! : range;
    const rangeVals = toValueArray(range);
    const sumVals = toValueArray(sumRange);
    let total = 0;
    for (let i = 0; i < rangeVals.length; i++) {
      const rv = rangeVals[i];
      if (rv !== undefined && matchCriteria(rv, criteria)) {
        const sv = sumVals[i];
        total += toNumber(sv !== undefined ? sv : 0);
      }
    }
    return total;
  },

  SUMIFS: (args) => {
    if (args.length < 3 || args.length % 2 !== 1) {
      throw new FormulaError('#VALUE!', 'SUMIFS requires sum_range followed by range/criteria pairs');
    }
    const sumRange = arg(args, 0);
    const sumVals = toValueArray(sumRange);
    const pairs: { range: Value[]; criteria: string }[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const range = args[i]!;
      const criteria = String(args[i + 1] ?? '');
      pairs.push({
        range: toValueArray(range),
        criteria,
      });
    }
    const len = sumVals.length;
    let total = 0;
    for (let i = 0; i < len; i++) {
      let match = true;
      for (const p of pairs) {
        const v = p.range[i];
        if (v === undefined || !matchCriteria(v, p.criteria)) {
          match = false;
          break;
        }
      }
      if (match) {
        const sv = sumVals[i];
        total += toNumber(sv !== undefined ? sv : 0);
      }
    }
    return total;
  },

  AVERAGEIF: (args) => {
    const range = arg(args, 0);
    const criteria = String(args[1] ?? '');
    const avgRange = args.length > 2 ? args[2]! : range;
    const rangeVals = toValueArray(range);
    const avgVals = toValueArray(avgRange);
    let total = 0;
    let count = 0;
    for (let i = 0; i < rangeVals.length; i++) {
      const rv = rangeVals[i];
      if (rv !== undefined && matchCriteria(rv, criteria)) {
        const av = avgVals[i];
        total += toNumber(av !== undefined ? av : 0);
        count++;
      }
    }
    if (count === 0) throw new FormulaError('#DIV/0!', 'AVERAGEIF: no matches');
    return total / count;
  },

  AVERAGEIFS: (args) => {
    if (args.length < 3 || args.length % 2 !== 1) {
      throw new FormulaError('#VALUE!', 'AVERAGEIFS requires avg_range followed by range/criteria pairs');
    }
    const avgRange = arg(args, 0);
    const avgVals = toValueArray(avgRange);
    const pairs: { range: Value[]; criteria: string }[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const range = args[i]!;
      const criteria = String(args[i + 1] ?? '');
      pairs.push({
        range: toValueArray(range),
        criteria,
      });
    }
    const len = avgVals.length;
    let total = 0;
    let count = 0;
    for (let i = 0; i < len; i++) {
      let match = true;
      for (const p of pairs) {
        const v = p.range[i];
        if (v === undefined || !matchCriteria(v, p.criteria)) {
          match = false;
          break;
        }
      }
      if (match) {
        const av = avgVals[i];
        total += toNumber(av !== undefined ? av : 0);
        count++;
      }
    }
    if (count === 0) throw new FormulaError('#DIV/0!', 'AVERAGEIFS: no matches');
    return total / count;
  },

  // ── Logical ──────────────────────────────────────────

  IF: (args) => {
    if (args.length < 2) throw new FormulaError('#VALUE!', 'IF requires at least 2 arguments');
    return isTruthy(arg(args, 0)) ? args[1]! : (args[2] ?? null);
  },

  AND: (args) => {
    const vals = flattenValues(args);
    for (const v of vals) {
      if (!isTruthy(v)) return false;
    }
    return vals.length > 0;
  },

  OR: (args) => {
    const vals = flattenValues(args);
    for (const v of vals) {
      if (isTruthy(v)) return true;
    }
    return false;
  },

  NOT: (args) => !isTruthy(arg(args, 0)),

  IFERROR: (args) => {
    const val = arg(args, 0);
    if (val === null || val === undefined) return args[1] ?? null;
    return val;
  },

  // ── Text ─────────────────────────────────────────────

  TEXT: (args) => {
    const value = arg(args, 0);
    const format = String(args[1] ?? '');

    if (value === null) return '';

    if (format.includes('yyyy') || format.includes('mm') || format.includes('dd')) {
      const d = isDate(value) ? value : new Date(Number(value));
      if (isNaN(d.getTime())) return String(value);
      return format
        .replace('yyyy', String(d.getFullYear()))
        .replace('mm', String(d.getMonth() + 1).padStart(2, '0'))
        .replace('dd', String(d.getDate()).padStart(2, '0'))
        .replace('hh', String(d.getHours()).padStart(2, '0'))
        .replace('nn', String(d.getMinutes()).padStart(2, '0'))
        .replace('ss', String(d.getSeconds()).padStart(2, '0'));
    }

    const num = typeof value === 'number' ? value : Number(value);
    if (isNaN(num)) return String(value);

    if (format === '0') return Math.round(num).toString();
    if (format === '0.00') return num.toFixed(2);
    if (format === '#,##0') return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (format === '0%') return `${Math.round(num * 100)}%`;

    return String(value);
  },

  CONCAT: (args) => args.map((a) => (a === null ? '' : String(a))).join(''),

  CONCATENATE: (args) => args.map((a) => (a === null ? '' : String(a))).join(''),

  LEN: (args) => String(arg(args, 0)).length,

  LEFT: (args) => {
    const s = String(arg(args, 0));
    const n = args[1] !== undefined ? coerceNumber(args[1]) : 1;
    return s.slice(0, n);
  },

  RIGHT: (args) => {
    const s = String(arg(args, 0));
    const n = args[1] !== undefined ? coerceNumber(args[1]) : 1;
    return s.slice(-n);
  },

  MID: (args) => {
    const s = String(arg(args, 0));
    const start = coerceNumber(arg(args, 1)) - 1;
    const len = coerceNumber(arg(args, 2));
    return s.slice(start, start + len);
  },

  TRIM: (args) => String(arg(args, 0)).trim(),

  UPPER: (args) => String(arg(args, 0)).toUpperCase(),

  LOWER: (args) => String(arg(args, 0)).toLowerCase(),

  PROPER: (args) => {
    const s = String(arg(args, 0));
    return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
  },

  SUBSTITUTE: (args) => {
    const text = String(arg(args, 0));
    const oldText = String(arg(args, 1));
    const newText = String(arg(args, 2));
    const instance = args[3] !== undefined ? coerceNumber(args[3]) : undefined;
    if (instance !== undefined) {
      let count = 0;
      return text.replace(new RegExp(escapeRegex(oldText), 'g'), (match) => {
        count++;
        return count === instance ? newText : match;
      });
    }
    return text.replaceAll(oldText, newText);
  },

  REPT: (args) => {
    const s = String(arg(args, 0));
    const n = coerceNumber(arg(args, 1));
    if (n < 0) throw new FormulaError('#VALUE!', 'REPT count must be non-negative');
    return s.repeat(n);
  },

  // ── Lookup ───────────────────────────────────────────

  VLOOKUP: (args) => {
    const lookupValue = arg(args, 0);
    const tableArray = arg(args, 1);
    const colIndex = coerceNumber(arg(args, 2));
    const rangeLookup = args[3] !== undefined ? isTruthy(args[3]) : true;

    if (!Array.isArray(tableArray) || tableArray.length === 0) {
      throw new FormulaError('#N/A', 'VLOOKUP: table array is empty');
    }
    if (colIndex < 1) throw new FormulaError('#VALUE!', 'VLOOKUP: column index must be >= 1');

    for (const row of tableArray) {
      if (!Array.isArray(row)) continue;
      const cellValue = row[0];
      if (rangeLookup) {
        if (toNumber(cellValue as Value) <= toNumber(lookupValue)) continue;
        break;
      } else {
        if (String(cellValue) === String(lookupValue)) {
          return (row[colIndex - 1] as Value) ?? null;
        }
      }
    }

    if (rangeLookup) {
      for (let i = tableArray.length - 1; i >= 0; i--) {
        const row = tableArray[i];
        if (Array.isArray(row) && toNumber(row[0] as Value) <= toNumber(lookupValue)) {
          return (row[colIndex - 1] as Value) ?? null;
        }
      }
    }

    throw new FormulaError('#N/A', 'VLOOKUP: value not found');
  },

  HLOOKUP: (args) => {
    const lookupValue = arg(args, 0);
    const tableArray = arg(args, 1);
    const rowIndex = coerceNumber(arg(args, 2));
    const rangeLookup = args[3] !== undefined ? isTruthy(args[3]) : true;

    if (!Array.isArray(tableArray) || tableArray.length === 0) {
      throw new FormulaError('#N/A', 'HLOOKUP: table array is empty');
    }
    if (rowIndex < 1) throw new FormulaError('#VALUE!', 'HLOOKUP: row index must be >= 1');

    const headerRow = tableArray[0];
    if (!Array.isArray(headerRow)) throw new FormulaError('#VALUE!', 'HLOOKUP: invalid table');

    for (let col = 0; col < headerRow.length; col++) {
      const hv = headerRow[col];
      if (rangeLookup) {
        if (toNumber(hv as Value) <= toNumber(lookupValue)) continue;
        if (col > 0) {
          const row = tableArray[rowIndex - 1];
          return Array.isArray(row) ? ((row[col - 1] as Value) ?? null) : null;
        }
        break;
      } else {
        if (String(hv) === String(lookupValue)) {
          const row = tableArray[rowIndex - 1];
          return Array.isArray(row) ? ((row[col] as Value) ?? null) : null;
        }
      }
    }

    if (rangeLookup) {
      const lastCol = headerRow.length - 1;
      const row = tableArray[rowIndex - 1];
      return Array.isArray(row) ? ((row[lastCol] as Value) ?? null) : null;
    }

    throw new FormulaError('#N/A', 'HLOOKUP: value not found');
  },

  LOOKUP: (args) => {
    const lookupValue = arg(args, 0);
    const lookupArray = arg(args, 1);

    if (!Array.isArray(lookupArray) || lookupArray.length === 0) {
      throw new FormulaError('#N/A', 'LOOKUP: array is empty');
    }

    for (let i = 0; i < lookupArray.length; i++) {
      const v = lookupArray[i];
      if (v !== undefined && String(v) === String(lookupValue)) {
        return v as Value;
      }
    }

    throw new FormulaError('#N/A', 'LOOKUP: value not found');
  },

  INDEX: (args) => {
    const array = arg(args, 0);
    const rowIdx = coerceNumber(arg(args, 1)) - 1;
    if (Array.isArray(array)) {
      const row = array[rowIdx];
      if (row === undefined) throw new FormulaError('#REF!', 'INDEX: row out of range');
      if (args.length > 2) {
        const colIdx = coerceNumber(args[2]!) - 1;
        if (Array.isArray(row)) return (row[colIdx] as Value) ?? null;
        return row as Value;
      }
      return row as Value;
    }
    throw new FormulaError('#VALUE!', 'INDEX: first argument must be an array');
  },

  MATCH: (args) => {
    const lookupValue = arg(args, 0);
    const lookupArray = arg(args, 1);

    if (!Array.isArray(lookupArray)) {
      throw new FormulaError('#VALUE!', 'MATCH: second argument must be an array');
    }

    const matchType = args.length > 2 ? coerceNumber(args[2]!) : 1;

    if (matchType === 0) {
      for (let i = 0; i < lookupArray.length; i++) {
        const v = lookupArray[i];
        if (v !== undefined && String(v) === String(lookupValue)) return i + 1;
      }
    } else if (matchType === 1) {
      let result = -1;
      for (let i = 0; i < lookupArray.length; i++) {
        const v = lookupArray[i];
        if (v !== undefined && toNumber(v as Value) <= toNumber(lookupValue)) result = i + 1;
      }
      if (result === -1) throw new FormulaError('#N/A', 'MATCH: no match found');
      return result;
    } else if (matchType === -1) {
      let result = -1;
      for (let i = 0; i < lookupArray.length; i++) {
        const v = lookupArray[i];
        if (v !== undefined && toNumber(v as Value) >= toNumber(lookupValue)) result = i + 1;
      }
      if (result === -1) throw new FormulaError('#N/A', 'MATCH: no match found');
      return result;
    }

    throw new FormulaError('#N/A', 'MATCH: no match found');
  },

  // ── Date / Time ──────────────────────────────────────

  DATE: (args) => {
    const year = coerceNumber(arg(args, 0));
    const month = coerceNumber(arg(args, 1));
    const day = coerceNumber(arg(args, 2));
    return new Date(year, month - 1, day) as InternalValue as Value;
  },

  NOW: (_args, ctx) => (ctx.now ?? new Date()) as InternalValue as Value,

  TODAY: (_args, ctx) => {
    const now = ctx.now ?? new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()) as InternalValue as Value;
  },

  YEAR: (args) => toDate(arg(args, 0)).getFullYear(),

  MONTH: (args) => toDate(arg(args, 0)).getMonth() + 1,

  DAY: (args) => toDate(arg(args, 0)).getDate(),

  HOUR: (args) => toDate(arg(args, 0)).getHours(),

  MINUTE: (args) => toDate(arg(args, 0)).getMinutes(),

  SECOND: (args) => toDate(arg(args, 0)).getSeconds(),

  EOMONTH: (args) => {
    const start = toDate(arg(args, 0));
    const months = coerceNumber(arg(args, 1));
    const d = new Date(start);
    d.setMonth(d.getMonth() + months + 1, 0);
    return d as InternalValue as Value;
  },

  EDATE: (args) => {
    const start = toDate(arg(args, 0));
    const months = coerceNumber(arg(args, 1));
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    return d as InternalValue as Value;
  },

  DATEDIF: (args) => {
    const start = toDate(arg(args, 0));
    const end = toDate(arg(args, 1));
    const unit = String(args[2] ?? 'D').toUpperCase();

    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    switch (unit) {
      case 'D': return diffDays;
      case 'M': return Math.floor(diffDays / 30);
      case 'Y': return Math.floor(diffDays / 365);
      default: throw new FormulaError('#VALUE!', `DATEDIF: unknown unit '${unit}'`);
    }
  },

  NETWORKDAYS: (args) => {
    const start = toDate(arg(args, 0));
    const end = toDate(arg(args, 1));
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  },

  WORKDAY: (args) => {
    const start = toDate(arg(args, 0));
    const days = coerceNumber(arg(args, 1));
    let count = 0;
    const d = new Date(start);
    while (count < days) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return d as InternalValue as Value;
  },

  // ── Type checks ──────────────────────────────────────

  ISBLANK: (args) => {
    const v = arg(args, 0);
    return v === null || v === undefined;
  },

  ISNUMBER: (args) => typeof arg(args, 0) === 'number',

  ISTEXT: (args) => typeof arg(args, 0) === 'string',
};

// ── internal helpers ─────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDate(v: Value | InternalValue): v is Date {
  return v instanceof Date;
}

function toDate(v: Value): Date {
  if (isDate(v)) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new FormulaError('#VALUE!', `Cannot convert '${v}' to date`);
    return d;
  }
  throw new FormulaError('#VALUE!', 'Expected a date');
}
