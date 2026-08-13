/**
 * Embed proxy — token management (Phase 08).
 *
 * Embed tokens are short-lived, single-use credentials that authorise
 * a proxy fetch.  Each token is created with a TTL and expires once
 * consumed.
 *
 * Public surface:
 *  - {@link EmbedTokenService} — create / consume tokens.
 *  - {@link EmbedTokenRecord} — the persisted shape.
 *  - {@link TokenExpiredError} / {@link TokenAlreadyUsedError} / {@link TokenNotFoundError}
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbedTokenRecord {
  readonly token: string;
  readonly bindingId: string;
  readonly url: string;
  /** ISO-8601 timestamp when the token expires. */
  readonly expiresAt: Date;
  /** Whether this token has been consumed (single-use). */
  readonly used: boolean;
  readonly createdAt: Date;
}

export interface EmbedTokenServiceOptions {
  /** TTL in milliseconds (default 5 minutes). */
  readonly ttlMs?: number;
  /** Clock for testing (default `Date.now()`). */
  readonly clock?: () => number;
  /** Token generator (default: 32-byte hex). */
  readonly generateToken?: () => string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TokenExpiredError extends Error {
  readonly code = 'TOKEN_EXPIRED' as const;
  constructor(public readonly token: string) {
    super(`Embed token expired: ${token}`);
    this.name = 'TokenExpiredError';
  }
}

export class TokenAlreadyUsedError extends Error {
  readonly code = 'TOKEN_ALREADY_USED' as const;
  constructor(public readonly token: string) {
    super(`Embed token already used: ${token}`);
    this.name = 'TokenAlreadyUsedError';
  }
}

export class TokenNotFoundError extends Error {
  readonly code = 'TOKEN_NOT_FOUND' as const;
  constructor(public readonly token: string) {
    super(`Embed token not found: ${token}`);
    this.name = 'TokenNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

let tokenCounter = 0;
function defaultGenerateToken(): string {
  tokenCounter++;
  const bytes = new Uint8Array(32);
  // Node 22+ has globalThis.crypto
  globalThis.crypto.getRandomValues(bytes);
  return (
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + tokenCounter.toString(36)
  );
}

export class EmbedTokenService {
  private readonly store = new Map<string, EmbedTokenRecord>();
  private readonly ttlMs: number;
  private readonly clock: () => number;
  private readonly generateToken: () => string;

  constructor(opts: EmbedTokenServiceOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.clock = opts.clock ?? (() => Date.now());
    this.generateToken = opts.generateToken ?? defaultGenerateToken;
  }

  /**
   * Create a new embed token for the given binding and URL.
   */
  create(bindingId: string, url: string): EmbedTokenRecord {
    const token = this.generateToken();
    const now = new Date(this.clock());
    const record: EmbedTokenRecord = {
      token,
      bindingId,
      url,
      expiresAt: new Date(now.getTime() + this.ttlMs),
      used: false,
      createdAt: now,
    };
    this.store.set(token, record);
    return record;
  }

  /**
   * Consume a token — marks it as used and returns the record.
   * Throws if expired, already used, or not found.
   */
  consume(token: string): EmbedTokenRecord {
    const record = this.store.get(token);
    if (!record) throw new TokenNotFoundError(token);
    if (record.used) throw new TokenAlreadyUsedError(token);
    if (this.clock() > record.expiresAt.getTime()) throw new TokenExpiredError(token);
    // Mark used
    const updated: EmbedTokenRecord = { ...record, used: true };
    this.store.set(token, updated);
    return updated;
  }

  /**
   * Peek at a token without consuming it (for embed page validation).
   */
  peek(token: string): EmbedTokenRecord | null {
    return this.store.get(token) ?? null;
  }

  /** Return current time in ms (delegates to clock). */
  now(): number {
    return this.clock();
  }

  /**
   * Remove expired tokens from the store (garbage collection).
   */
  gc(): number {
    const now = this.clock();
    let removed = 0;
    for (const [key, record] of this.store) {
      if (now > record.expiresAt.getTime()) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
