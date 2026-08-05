/**
 * AR Session — service layer (Phase 11 M5.3).
 *
 * Session lifecycle: create → active → (expired | invalidated).
 * State machine:
 *   - created:   session minted, token issued
 *   - active:    audience has visited (refreshActivity called)
 *   - expired:   TTL or inactivity timeout reached
 *   - invalidated: manually killed via DELETE
 *
 * 30-minute total TTL, 5-minute inactivity timeout, per-session
 * rotating HMAC keys. Injectable clock for deterministic tests.
 */

import {
  mintToken,
  verifyToken,
  generateSecret,
  DEFAULT_TTL_MS,
  DEFAULT_INACTIVITY_MS,
  TokenExpiredError,
  type MintTokenResult,
  type TokenPayload,
} from './tokens.js';
import { buildAudienceUrl, buildQrPayload } from './deeplink.js';

// ── Types ────────────────────────────────────────────────────────────

export type SessionState = 'created' | 'active' | 'expired' | 'invalidated';

export interface ArSession {
  readonly id: string;
  readonly slideId: string;
  readonly modelAssetId: string;
  readonly token: string;
  readonly audienceUrl: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly state: SessionState;
  /** HMAC secret for this session (not serialized to API response). */
  readonly _secret: string;
  /** Current key id (rotated on key rotation). */
  readonly _kid: string;
  /** Last activity timestamp (for inactivity timeout). */
  readonly _lastActivityAt: number;
}

export interface ArSessionResponse {
  readonly id: string;
  readonly slideId: string;
  readonly modelAssetId: string;
  readonly token: string;
  readonly audienceUrl: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly qrPayload?: string;
}

export interface CreateSessionInput {
  readonly slideId: string;
  readonly modelAssetId: string;
  readonly ttlMs?: number;
  readonly inactivityMs?: number;
}

export interface SessionServiceOptions {
  /** Clock returning ms since epoch. Defaults to Date.now. */
  readonly clock?: () => number;
  /** TTL in ms. Defaults to 30 min. */
  readonly ttlMs?: number;
  /** Inactivity timeout in ms. Defaults to 5 min. */
  readonly inactivityMs?: number;
  /** Base URL for audience URLs. Defaults to https://ar.domio.app. */
  readonly audienceBaseUrl?: string;
  /** ID generator. Defaults to crypto.randomUUID. */
  readonly idGenerator?: () => string;
}

// ── Errors ───────────────────────────────────────────────────────────

export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND' as const;
  constructor(id: string) {
    super(`AR session ${id} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionExpiredError extends Error {
  readonly code = 'SESSION_EXPIRED' as const;
  constructor(id: string) {
    super(`AR session ${id} has expired`);
    this.name = 'SessionExpiredError';
  }
}

export class SessionInvalidatedError extends Error {
  readonly code = 'SESSION_INVALIDATED' as const;
  constructor(id: string) {
    super(`AR session ${id} has been invalidated`);
    this.name = 'SessionInvalidatedError';
  }
}

export class SessionValidationError extends Error {
  readonly code = 'SESSION_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

// ── In-memory DAL ────────────────────────────────────────────────────

export class InMemorySessionRepository {
  private rows = new Map<string, ArSession>();

  async insert(session: ArSession): Promise<void> {
    this.rows.set(session.id, session);
  }

  async findById(id: string): Promise<ArSession | null> {
    return this.rows.get(id) ?? null;
  }

  async update(id: string, patch: Partial<ArSession>): Promise<ArSession> {
    const existing = this.rows.get(id);
    if (!existing) throw new SessionNotFoundError(id);
    const updated = { ...existing, ...patch } as ArSession;
    this.rows.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

// ── Service ──────────────────────────────────────────────────────────

export class SessionService {
  private readonly repo: InMemorySessionRepository;
  private readonly clock: () => number;
  private readonly ttlMs: number;
  private readonly inactivityMs: number;
  private readonly audienceBaseUrl: string;
  private readonly idGen: () => string;

  constructor(opts: SessionServiceOptions = {}) {
    this.repo = new InMemorySessionRepository();
    this.clock = opts.clock ?? (() => Date.now());
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.inactivityMs = opts.inactivityMs ?? DEFAULT_INACTIVITY_MS;
    this.audienceBaseUrl = opts.audienceBaseUrl ?? 'https://ar.domio.app';
    this.idGen = opts.idGenerator ?? (() => crypto.randomUUID());
  }

  /**
   * Create a new AR session. Mints a signed token, builds the
   * audience URL, and returns the session data.
   */
  async createSession(input: CreateSessionInput): Promise<ArSession> {
    if (!input.slideId) {
      throw new SessionValidationError('slideId is required');
    }
    if (!input.modelAssetId) {
      throw new SessionValidationError('modelAssetId is required');
    }

    const now = this.clock();
    const id = this.idGen();
    const secret = generateSecret();
    const kid = `ar-kid-${id.slice(0, 8)}`;

    const tokenResult: MintTokenResult = mintToken({
      sessionId: id,
      secret,
      kid,
      clock: this.clock,
      ttlMs: input.ttlMs ?? this.ttlMs,
    });

    const audienceUrl = buildAudienceUrl({
      sessionId: id,
      token: tokenResult.token,
      baseUrl: this.audienceBaseUrl,
    });

    const session: ArSession = {
      id,
      slideId: input.slideId,
      modelAssetId: input.modelAssetId,
      token: tokenResult.token,
      audienceUrl,
      expiresAt: tokenResult.expiresAt,
      createdAt: new Date(now),
      state: 'created',
      _secret: secret,
      _kid: kid,
      _lastActivityAt: now,
    };

    await this.repo.insert(session);
    return session;
  }

  /**
   * Get a session by ID. Checks for expiry and inactivity timeout.
   */
  async getSession(id: string): Promise<ArSession> {
    const session = await this.repo.findById(id);
    if (!session) throw new SessionNotFoundError(id);

    // Check if session has been manually invalidated
    if (session.state === 'invalidated') {
      throw new SessionInvalidatedError(id);
    }

    // Check TTL expiry
    const now = this.clock();
    if (now > session.expiresAt.getTime()) {
      await this.repo.update(id, { state: 'expired' });
      throw new SessionExpiredError(id);
    }

    // Check inactivity timeout
    if (now - session._lastActivityAt > this.inactivityMs) {
      await this.repo.update(id, { state: 'expired' });
      throw new SessionExpiredError(id);
    }

    // If state was 'created', transition to 'active'
    if (session.state === 'created') {
      const updated = await this.repo.update(id, { state: 'active' });
      return updated;
    }

    return session;
  }

  /**
   * Invalidate a session immediately. The audience URL will
   * no longer be accessible.
   */
  async invalidateSession(id: string): Promise<void> {
    const session = await this.repo.findById(id);
    if (!session) throw new SessionNotFoundError(id);

    if (session.state === 'invalidated') {
      throw new SessionInvalidatedError(id);
    }

    await this.repo.update(id, { state: 'invalidated' });
  }

  /**
   * Refresh the activity timestamp. Called when the audience
   * interacts with the AR viewer, resetting the inactivity timer.
   */
  async refreshActivity(id: string): Promise<void> {
    const session = await this.repo.findById(id);
    if (!session) throw new SessionNotFoundError(id);

    if (session.state === 'invalidated') {
      throw new SessionInvalidatedError(id);
    }

    const now = this.clock();
    if (now > session.expiresAt.getTime()) {
      await this.repo.update(id, { state: 'expired' });
      throw new SessionExpiredError(id);
    }

    await this.repo.update(id, { _lastActivityAt: now });
  }

  /**
   * Verify a token for a session. Used by the audience viewer
   * to authenticate the AR session.
   */
  async verifySessionToken(id: string, token: string): Promise<TokenPayload> {
    const session = await this.repo.findById(id);
    if (!session) throw new SessionNotFoundError(id);

    if (session.state === 'invalidated') {
      throw new SessionInvalidatedError(id);
    }

    const now = this.clock();
    if (now > session.expiresAt.getTime()) {
      await this.repo.update(id, { state: 'expired' });
      throw new SessionExpiredError(id);
    }

    try {
      return verifyToken({
        token,
        secret: session._secret,
        kid: session._kid,
        clock: this.clock,
      });
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        await this.repo.update(id, { state: 'expired' });
        throw e;
      }
      throw e;
    }
  }

  /**
   * Rotate the signing key for a session. Old key is invalidated.
   */
  async rotateKey(id: string): Promise<{ kid: string; expiresAt: Date }> {
    const session = await this.repo.findById(id);
    if (!session) throw new SessionNotFoundError(id);

    if (session.state === 'invalidated') {
      throw new SessionInvalidatedError(id);
    }

    const newSecret = generateSecret();
    const newKid = `ar-kid-rot-${Date.now().toString(36)}`;

    const tokenResult = mintToken({
      sessionId: id,
      secret: newSecret,
      kid: newKid,
      clock: this.clock,
      ttlMs: this.ttlMs,
    });

    await this.repo.update(id, {
      _secret: newSecret,
      _kid: newKid,
      token: tokenResult.token,
      audienceUrl: buildAudienceUrl({
        sessionId: id,
        token: tokenResult.token,
        baseUrl: this.audienceBaseUrl,
      }),
      expiresAt: tokenResult.expiresAt,
    });

    return { kid: newKid, expiresAt: tokenResult.expiresAt };
  }

  /**
   * Build the API response shape from an internal session.
   */
  toResponse(session: ArSession): ArSessionResponse {
    const qrPayload = buildQrPayload({
      sessionId: session.id,
      token: session.token,
      expiresAt: session.expiresAt,
      baseUrl: this.audienceBaseUrl,
    });
    return {
      id: session.id,
      slideId: session.slideId,
      modelAssetId: session.modelAssetId,
      token: session.token,
      audienceUrl: session.audienceUrl,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      qrPayload: JSON.stringify(qrPayload),
    };
  }

  /**
   * Check if a session is in a usable (non-terminal) state.
   */
  isUsable(session: ArSession): boolean {
    return session.state === 'created' || session.state === 'active';
  }
}
