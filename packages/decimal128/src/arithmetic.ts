/**
 * Decimal-128 arithmetic primitives.
 *
 * Phase 10 M4.2 — the calculator engine uses 38-digit precision
 * internally and only narrows to JS `number` at boundary points.
 * Internally values are strings to keep full precision and to make
 * divide-by-zero and overflow behavior explicit.
 *
 * Operations:
 *   - add(a, b), sub(a, b), mul(a, b), div(a, b)
 *   - compare(a, b), isZero(x), isFinite(x), isNaN(x)
 *
 * Overflow clamps at `±OVERFLOW_MAX`. `div` by zero returns `0` and
 * sets `was_zero_division: true` on the result envelope.
 *
 * Implementation: BigInt-backed, scaled to 38 fraction digits.
 */

export type DecInput = string | number | bigint;

export interface DecResult {
  readonly value: string;
  readonly was_zero_division?: boolean;
  readonly was_overflow?: boolean;
  readonly was_underflow?: boolean;
}

export const DEC128_PRECISION = 38;

export const OVERFLOW_MAX = '9.9999999999999999999999999999999999999E+6144';

const OVERFLOW_MIN = '-' + OVERFLOW_MAX;

/** Convert any input into a canonical string. */
export function toString(x: DecInput): string {
  if (typeof x === 'string') return normalize(x);
  if (typeof x === 'number') {
    if (Number.isNaN(x)) return 'NaN';
    if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
    return normalize(String(x));
  }
  return normalize(x.toString());
}

function normalize(s: string): string {
  const trimmed = s.trim();
  if (trimmed === '' || trimmed === '-') throw new Error(`Decimal: invalid '${s}'`);
  if (trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity') return trimmed;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    throw new Error(`Decimal: invalid '${s}'`);
  }
  return trimmed;
}

// ── Predicates ──────────────────────────────────────────────────────────

export function isNaN(x: string): boolean { return x === 'NaN'; }
export function isInfinity(x: string): boolean { return x === 'Infinity' || x === '-Infinity'; }
export function isFinite(x: string): boolean {
  return !isNaN(x) && !isInfinity(x);
}
export function isZero(x: string): boolean {
  const n = toString(x);
  return n === '0' || n === '0.0' || /^[-+]?0(\.0+)?$/.test(n);
}

export function compare(a: string, b: string): -1 | 0 | 1 {
  const x = toString(a), y = toString(b);
  if (x === y) return 0;
  if (isNaN(x) || isNaN(y)) return NaN as unknown as -1;
  const ax = toParts(x), ay = toParts(y);
  if (ax.sign !== ay.sign) return ax.sign === '+' ? 1 : -1;
  return (cmpMagnitude(ax, ay) as -1 | 0 | 1) * (ax.sign === '+' ? 1 : -1);
}

interface Parts {
  sign: '+' | '-';
  intDigits: string;
  fracDigits: string;
  exp: number;
}

function toParts(x: string): Parts {
  const m = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(x);
  if (!m) throw new Error(`Decimal: invalid '${x}'`);
  const sign = (m[1] === '-' ? '-' : '+') as '+' | '-';
  const mant = m[2]!;
  const eStr = m[3];
  const exp = eStr ? Number(eStr) : 0;
  const dot = mant.indexOf('.');
  let intDigits: string;
  let fracDigits: string;
  if (dot === -1) {
    intDigits = mant;
    fracDigits = '';
  } else {
    intDigits = mant.slice(0, dot);
    fracDigits = mant.slice(dot + 1);
  }
  intDigits = stripLeadingZeros(intDigits === '' ? '0' : intDigits);
  fracDigits = stripTrailingZeros(fracDigits);
  return { sign, intDigits, fracDigits, exp };
}

function stripLeadingZeros(s: string): string {
  let i = 0;
  while (i < s.length - 1 && s.charAt(i) === '0') i++;
  return s.slice(i);
}

function stripTrailingZeros(s: string): string {
  let i = s.length;
  while (i > 0 && s.charAt(i - 1) === '0') i--;
  return s.slice(0, i);
}

function cmpMagnitude(a: Parts, b: Parts): number {
  // Compute adjusted exponent of the most-significant digit.
  const aExp = a.exp + a.intDigits.length - 1;
  const bExp = b.exp + b.intDigits.length - 1;
  if (aExp !== bExp) return aExp > bExp ? 1 : -1;
  // Same leading exponent — stream digits left-to-right.
  const aStream = streamDigits(a, aExp);
  const bStream = streamDigits(b, bExp);
  const len = Math.max(aStream.length, bStream.length);
  for (let i = 0; i < len; i++) {
    const av = i < aStream.length ? aStream.charCodeAt(i) - 48 : 0;
    const bv = i < bStream.length ? bStream.charCodeAt(i) - 48 : 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function streamDigits(p: Parts, adjustedExp: number): string {
  // All integer digits, then fractional digits. But the integer part
  // has `p.intDigits.length` digits at exponents [exp + len - 1 .. exp],
  // and frac digits are at exponents [exp - 1 .. exp - fracDigits.length].
  // To compare cleanly: align all digits to the highest exponent `adjustedExp`.
  // For our use here, intDigits + fracDigits + zeros suffice because both
  // operands share the same adjustedExp.
  const total = p.intDigits + p.fracDigits;
  // Pad to represent `adjustedExp + 1` digits total.
  const targetLen = adjustedExp - p.exp + 1;
  if (total.length >= targetLen) return total.slice(total.length - targetLen);
  return total.padStart(targetLen, '0');
}

// ── Add / Sub ───────────────────────────────────────────────────────────

export function add(a: DecInput, b: DecInput): DecResult {
  const x = toString(a), y = toString(b);
  if (isNaN(x) || isNaN(y)) return { value: 'NaN' };
  if (isInfinity(x) || isInfinity(y)) {
    if ((x === 'Infinity' && y === '-Infinity') || (x === '-Infinity' && y === 'Infinity')) {
      return { value: 'NaN' };
    }
    return { value: isInfinity(x) ? x : y };
  }
  const xa = toParts(x), ya = toParts(y);
  if (xa.sign === ya.sign) {
    const sum = addMagnitudes(xa, ya);
    return clamp({ value: applySign(sum.value, xa.sign), was_overflow: sum.overflow });
  }
  const cmp = cmpMagnitude(xa, ya);
  if (cmp === 0) return { value: '0' };
  if (cmp > 0) {
    const diff = subMagnitudes(xa, ya);
    return { value: applySign(diff, xa.sign) };
  }
  const diff = subMagnitudes(ya, xa);
  return { value: applySign(diff, ya.sign) };
}

export function sub(a: DecInput, b: DecInput): DecResult {
  const y = toString(b);
  const flipped: DecInput = y.startsWith('-') ? y.slice(1) : '-' + y;
  return add(a, flipped);
}

function addMagnitudes(a: Parts, b: Parts): { value: string; overflow: boolean } {
  // Use BigInt scaled to a common exponent.
  const SCALE = 38;
  const aScaled = scaleToBigInt(a, SCALE);
  const bScaled = scaleToBigInt(b, SCALE);
  const sum = aScaled + bScaled;
  return bigIntToDecimal(sum, SCALE, '+');
}

function scaleToBigInt(p: Parts, scale: number): bigint {
  // value * 10^scale
  const intPart = p.intDigits === '' ? 0n : BigInt(p.intDigits);
  const fracPart = p.fracDigits === '' ? 0n : BigInt(p.fracDigits);
  const fracLen = p.fracDigits.length;
  const exp = p.exp;
  // val * 10^scale = intPart * 10^(exp + scale) + fracPart * 10^(exp + scale - fracLen)
  const intExp = exp + scale;
  const fracExp = exp + scale - fracLen;
  let total = intPart * (10n ** BigInt(intExp));
  if (fracPart !== 0n && fracExp >= 0) total += fracPart * (10n ** BigInt(fracExp));
  else if (fracPart !== 0n && fracExp < 0) total += fracPart / (10n ** BigInt(-fracExp));
  return p.sign === '-' ? -total : total;
}

function bigIntToDecimal(value: bigint, scale: number, sign: '+' | '-'): { value: string; overflow: boolean } {
  if (value === 0n) return { value: '0', overflow: false };
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const s = abs.toString().padStart(scale + 1, '0');
  const intPart = s.slice(0, s.length - scale);
  const fracPart = stripTrailingZeros(s.slice(s.length - scale));
  const cleanedInt = stripLeadingZeros(intPart);
  const formatted = fracPart ? `${cleanedInt}.${fracPart}` : cleanedInt;
  const overflow = abs >= 10n ** BigInt(DEC128_PRECISION + 6144);
  const out = negative && formatted !== '0' ? '-' + formatted : formatted;
  void sign;
  return { value: out, overflow };
}

function subMagnitudes(larger: Parts, smaller: Parts): string {
  const SCALE = 38;
  // Subtract absolute magnitudes (signs handled by caller).
  const aMag = scaleToBigInt({ ...larger, sign: '+' }, SCALE);
  const bMag = scaleToBigInt({ ...smaller, sign: '+' }, SCALE);
  const diff = aMag - bMag;
  return bigIntToDecimal(diff, SCALE, '+').value;
}

function applySign(v: string, sign: '+' | '-'): string {
  if (v === '0') return '0';
  return sign === '-' ? '-' + v : v;
}

function clamp(r: DecResult): DecResult {
  if (!isNaN(r.value) && !isInfinity(r.value)) {
    if (!r.value.startsWith('-') && compare(r.value, OVERFLOW_MAX) > 0) {
      return { value: OVERFLOW_MAX, was_overflow: true };
    }
    if (r.value.startsWith('-') && compare(r.value, OVERFLOW_MIN) < 0) {
      return { value: OVERFLOW_MIN, was_overflow: true };
    }
  }
  return r;
}

// ── Multiply ────────────────────────────────────────────────────────────

export function mul(a: DecInput, b: DecInput): DecResult {
  const x = toString(a), y = toString(b);
  if (isNaN(x) || isNaN(y)) return { value: 'NaN' };
  if (isZero(x) || isZero(y)) {
    if (isInfinity(x) || isInfinity(y)) return { value: 'NaN' };
    return { value: '0' };
  }
  if (isInfinity(x) || isInfinity(y)) {
    return { value: (signOf(x) * signOf(y) > 0) ? 'Infinity' : '-Infinity' };
  }
  const xa = toParts(x), ya = toParts(y);
  const SCALE = 38;
  const aScaled = scaleToBigInt(xa, SCALE);
  const bScaled = scaleToBigInt(ya, SCALE);
  const product = (aScaled * bScaled) / (10n ** BigInt(SCALE));
  const out = bigIntToDecimal(product, SCALE, '+');
  // bigIntToDecimal already handles sign from the BigInt itself.
  return clamp({ value: out.value, was_overflow: out.overflow });
}

function signOf(x: string): number {
  if (isNaN(x)) return 0;
  return x.startsWith('-') ? -1 : 1;
}

// ── Divide ──────────────────────────────────────────────────────────────

export interface DivResult extends DecResult {
  readonly was_zero_division?: boolean;
}

export function div(a: DecInput, b: DecInput): DecResult {
  const x = toString(a), y = toString(b);
  if (isNaN(x) || isNaN(y)) return { value: 'NaN' };
  if (isZero(y)) {
    if (isZero(x)) return { value: 'NaN' };
    return { value: '0', was_zero_division: true };
  }
  if (isZero(x)) return { value: '0' };
  if (isInfinity(x)) {
    if (isInfinity(y)) return { value: 'NaN' };
    return { value: signOf(x) * signOf(y) > 0 ? 'Infinity' : '-Infinity' };
  }
  if (isInfinity(y)) {
    return { value: '0' };
  }
  const xa = toParts(x), ya = toParts(y);
  const SCALE = 38;
  const aScaled = scaleToBigInt(xa, SCALE);
  const bScaled = scaleToBigInt(ya, SCALE);
  const product = (aScaled * (10n ** BigInt(SCALE))) / bScaled;
  const out = bigIntToDecimal(product, SCALE, '+');
  return clamp({ value: out.value, was_overflow: out.overflow });
}

// ── Round (banker's rounding default) ───────────────────────────────────

export type RoundingMode = 'bankers' | 'half-up' | 'half-down';

export function round(value: DecInput, scale: number, mode: RoundingMode = 'bankers'): DecResult {
  if (scale < 0) throw new Error('scale must be >= 0');
  const v = toString(value);
  if (isNaN(v) || isInfinity(v)) return { value: v };
  if (scale === 0) {
    const rounded = roundInt(v, mode);
    return { value: rounded };
  }
  const dot = v.indexOf('.');
  if (dot === -1) return { value: v };
  const intPart = v.slice(0, dot);
  const fracPart = v.slice(dot + 1);
  if (fracPart.length <= scale) return { value: v };
  const kept = fracPart.slice(0, scale);
  const cut = fracPart.charAt(scale);
  const after = fracPart.slice(scale + 1);
  const allZerosAfter = after === '' || /^0+$/.test(after);
  let bump = 0;
  const nextDigit = Number(cut);
  if (mode === 'half-up') {
    if (nextDigit > 5) bump = 1;
    else if (nextDigit < 5) bump = 0;
    else bump = 1;
  } else if (mode === 'half-down') {
    if (nextDigit > 5) bump = 1;
    else if (nextDigit < 5) bump = 0;
    else bump = 0;
  } else {
    if (nextDigit > 5) bump = 1;
    else if (nextDigit < 5) bump = 0;
    else {
      if (allZerosAfter) bump = isEvenLast(kept) ? 0 : 1;
      else bump = 1;
    }
  }
  if (bump === 0) {
    return { value: `${intPart}.${kept}` };
  }
  let lastIdx = kept.length - 1;
  const chars = kept.split('');
  let carry = 1;
  while (lastIdx >= 0 && carry) {
    const d = Number(chars[lastIdx]);
    let nd = d + carry;
    if (nd >= 10) { nd -= 10; carry = 1; } else carry = 0;
    chars[lastIdx] = String(nd);
    lastIdx--;
  }
  const bumpedKept = chars.join('');
  if (carry) {
    return { value: `${addOne(intPart)}.${'0'.repeat(scale)}` };
  }
  return { value: `${intPart}.${bumpedKept}` };
}

function isEvenLast(kept: string): boolean {
  return Number(kept.charAt(kept.length - 1)) % 2 === 0;
}

function roundInt(value: string, mode: RoundingMode): string {
  const dot = value.indexOf('.');
  const intPart = dot === -1 ? value : value.slice(0, dot);
  const fracPart = dot === -1 ? '' : value.slice(dot + 1);
  if (fracPart === '') return intPart;
  const firstDigit = Number(fracPart.charAt(0));
  const rest = fracPart.slice(1);
  const allZeros = rest === '' || /^0+$/.test(rest);
  let bump = 0;
  if (mode === 'half-up') {
    if (firstDigit > 5) bump = 1;
    else if (firstDigit < 5) bump = 0;
    else bump = 1;
  } else if (mode === 'half-down') {
    if (firstDigit > 5) bump = 1;
    else if (firstDigit < 5) bump = 0;
    else bump = 0;
  } else {
    if (firstDigit > 5) bump = 1;
    else if (firstDigit < 5) bump = 0;
    else bump = (allZeros && isEvenLast(intPart)) ? 0 : 1;
  }
  if (bump === 0) return intPart;
  return addOne(intPart);
}

function addOne(intPart: string): string {
  const negative = intPart.startsWith('-');
  const digits = (negative ? intPart.slice(1) : intPart).split('');
  let carry = 1;
  for (let i = digits.length - 1; i >= 0 && carry; i--) {
    const d = Number(digits[i]);
    let nd = d + 1;
    if (nd >= 10) { nd -= 10; carry = 1; } else carry = 0;
    digits[i] = String(nd);
  }
  if (carry) digits.unshift('1');
  return (negative ? '-' : '') + digits.join('');
}