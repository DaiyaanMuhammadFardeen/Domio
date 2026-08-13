/**
 * Decimal arithmetic that avoids floating-point errors.
 *
 * Internally stores values as integer mantissa × 10^(-scale), so
 * arithmetic is exact for numbers representable at the chosen scale.
 *
 * Usage:
 *   const a = Decimal.from(0.1);   // scale = 10, mantissa = 1000000000
 *   const b = Decimal.from(0.2);
 *   const c = a.add(b);            // exact 0.3
 *   c.toNumber() === 0.3           // true — no 0.30000000000000004
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecimalOptions {
  /** Decimal places to retain (default: 10). */
  scale?: number;
  /** Rounding mode (default: 'half-even'). */
  rounding?: 'half-even' | 'half-up' | 'half-down' | 'ceil' | 'floor';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SCALE = 10;

function parseToMantissa(value: string | number, scale: number): bigint {
  let str: string;
  if (typeof value === 'number') {
    str = value.toString();
  } else {
    str = value;
  }

  // Handle scientific notation
  if (str.includes('e') || str.includes('E')) {
    const num = Number(str);
    str = num.toFixed(scale);
  }

  const parts = str.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '';

  // Pad or truncate the fractional part to `scale` digits
  const paddedFrac = fracPart.padEnd(scale, '0').slice(0, scale);
  const digits = `${intPart}${paddedFrac}`;

  // Remove leading zeros but keep at least one digit
  const trimmed = digits.replace(/^0+/, '') || '0';
  return BigInt(trimmed);
}

function roundHalfEven(mantissa: bigint, divisor: bigint): bigint {
  const quotient = mantissa / divisor;
  const remainder = mantissa % divisor;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const halfDivisor = divisor / 2n;

  if (absRemainder < halfDivisor) {
    return quotient;
  } else if (absRemainder > halfDivisor) {
    return quotient + (mantissa > 0n ? 1n : -1n);
  } else {
    // Exactly half — round to even
    if (quotient % 2n === 0n) {
      return quotient;
    }
    return quotient + (mantissa > 0n ? 1n : -1n);
  }
}

function applyRounding(mantissa: bigint, divisor: bigint, rounding: string): bigint {
  switch (rounding) {
    case 'half-up':
      return mantissa / divisor + (mantissa % divisor > 0n ? 1n : 0n);
    case 'half-down':
      return mantissa / divisor + (mantissa % divisor >= 0n ? 0n : 0n);
    case 'ceil':
      return mantissa / divisor + (mantissa % divisor > 0n ? 1n : 0n);
    case 'floor':
      return mantissa / divisor;
    default:
      return roundHalfEven(mantissa, divisor);
  }
}

// ---------------------------------------------------------------------------
// Decimal class
// ---------------------------------------------------------------------------

export class Decimal {
  private readonly mantissa: bigint;
  private readonly scale: number;
  private readonly rounding: string;

  private constructor(mantissa: bigint, scale: number, rounding: string) {
    this.mantissa = mantissa;
    this.scale = scale;
    this.rounding = rounding;
  }

  static from(value: string | number, opts: DecimalOptions = {}): Decimal {
    const scale = opts.scale ?? DEFAULT_SCALE;
    const rounding = opts.rounding ?? 'half-even';
    const mantissa = parseToMantissa(value, scale);
    return new Decimal(mantissa, scale, rounding);
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    const a =
      this.scale < scale ? this.mantissa * BigInt(10 ** (scale - this.scale)) : this.mantissa;
    const b =
      other.scale < scale ? other.mantissa * BigInt(10 ** (scale - other.scale)) : other.mantissa;
    return new Decimal(a + b, scale, this.rounding);
  }

  sub(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    const a =
      this.scale < scale ? this.mantissa * BigInt(10 ** (scale - this.scale)) : this.mantissa;
    const b =
      other.scale < scale ? other.mantissa * BigInt(10 ** (scale - other.scale)) : other.mantissa;
    return new Decimal(a - b, scale, this.rounding);
  }

  mul(other: Decimal): Decimal {
    const result = this.mantissa * other.mantissa;
    const divisor = BigInt(10 ** this.scale);
    const rounded = applyRounding(result, divisor, this.rounding);
    return new Decimal(rounded, other.scale, this.rounding);
  }

  div(other: Decimal): Decimal {
    if (other.mantissa === 0n) {
      throw new Error('Division by zero');
    }
    const dividend = this.mantissa * BigInt(10 ** other.scale);
    const rounded = applyRounding(dividend, other.mantissa, this.rounding);
    return new Decimal(rounded, other.scale, this.rounding);
  }

  toNumber(): number {
    const sign = this.mantissa < 0n ? '-' : '';
    const abs = this.mantissa < 0n ? -this.mantissa : this.mantissa;
    const str = abs.toString().padStart(this.scale + 1, '0');
    const intPart = str.slice(0, str.length - this.scale);
    const fracPart = str.slice(str.length - this.scale);
    return Number(`${sign}${intPart}.${fracPart}`);
  }

  toString(): string {
    return this.toNumber().toString();
  }

  equals(other: Decimal): boolean {
    const scale = Math.max(this.scale, other.scale);
    const a =
      this.scale < scale ? this.mantissa * BigInt(10 ** (scale - this.scale)) : this.mantissa;
    const b =
      other.scale < scale ? other.mantissa * BigInt(10 ** (scale - other.scale)) : other.mantissa;
    return a === b;
  }
}
