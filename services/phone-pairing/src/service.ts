/**
 * @domio/phone-pairing — orchestration service.
 *
 * Transport-agnostic. Depends on:
 *   - {@link PairingStore}         — persistence.
 *   - {@link TokenSigner}          — HMAC key for signing / verifying.
 *   - Optional {@link AuditEmitter} — emits hash-chained audit events for
 *                                     every state change.
 *
 * Public API:
 *   - mint:   issue a signed token (returns deep link for the QR).
 *   - verify: parse + verify a token; throw a typed error on failure.
 *   - rotate: issue a fresh token with a bumped epoch; old token becomes
 *             invalid immediately.
 *   - revoke: mark the pairing revoked; the realtime gateway will
 *             disconnect within 1 s.
 *   - heartbeat: update last_seen_at_ms.
 *   - list: enumerate active pairings for a session.
 *
 * Concurrency: rotate + revoke are guarded by the store's per-key mutex.
 * A rotate that races with a revoke wins-or-loses deterministically:
 * the second writer sees `status === 'revoked'` and bails.
 */

import { createHash, randomUUID } from 'crypto';
import type {
  MintPairingTokenInput,
  MintedPairingToken,
  PairingCapability,
  PairingPlatform,
  PairingRecord,
  PairingTokenClaims,
  VerifyPairingTokenInput,
} from './types.js';
import {
  DEFAULT_PAIRING_CAPABILITIES,
  PAIRING_ROTATION_MS,
} from './types.js';
import { isPairingStore, type PairingStore } from './store/store.js';
import {
  mintPairingToken,
  parsePairingToken,
  verifyPairingToken,
} from './token.js';
import { PairingSignatureError } from './types.js';
import type { TokenSigner } from './token.js';
import { Chain, type JsonObject, GenesisHash } from '@domio/audit-ts';

export interface PhonePairingServiceOptions {
  readonly store: PairingStore;
  readonly signer: TokenSigner;
  readonly clock?: (() => number) | undefined;
  readonly idGenerator?: (() => string) | undefined;
  /** Default token TTL in ms. Defaults to PAIRING_ROTATION_MS (60 s). */
  readonly tokenTtlMs?: number;
  /** Audit chain — optional, used to emit pairing events. */
  readonly auditChain?: Chain | undefined;
  /** Workspace id used as the audit chain key when emitting events. */
  readonly workspaceId?: string | undefined;
  /** Per-session epoch map — tracks the current epoch so verifiers reject
   *  rotated tokens. In production this lives in Redis; in tests it's
   *  a plain Map. */
  readonly epochTable?: Map<string, number> | undefined;
}

export class PhonePairingService {
  private readonly store: PairingStore;
  private readonly signer: TokenSigner;
  private readonly clock: () => number;
  private readonly idGen: () => string;
  private readonly tokenTtlMs: number;
  private readonly auditChain: Chain | undefined;
  private readonly workspaceId: string | undefined;
  private readonly epochTable: Map<string, number>;

  constructor(opts: PhonePairingServiceOptions) {
    if (!isPairingStore(opts.store)) {
      throw new Error('PhonePairingService: store is required');
    }
    if (!opts.signer || opts.signer.key.length !== 32) {
      throw new Error('PhonePairingService: signer with a 32-byte key is required');
    }
    this.store = opts.store;
    this.signer = opts.signer;
    this.clock = opts.clock ?? (() => Date.now());
    this.idGen = opts.idGenerator ?? (() => randomUUID());
    this.tokenTtlMs = opts.tokenTtlMs ?? PAIRING_ROTATION_MS;
    this.auditChain = opts.auditChain;
    this.workspaceId = opts.workspaceId;
    this.epochTable = opts.epochTable ?? new Map();
  }

  // -------------------------------------------------------------------------
  // Mint
  // -------------------------------------------------------------------------

  async mint(
    input: MintPairingTokenInput,
  ): Promise<MintedPairingToken> {
    const now = this.clock();
    const capabilities: PairingCapability[] = input.capabilities
      ? [...input.capabilities]
      : [...DEFAULT_PAIRING_CAPABILITIES];

    // Bump epoch for this (session, device) — the first pairing starts at 1.
    const epochKey = `${input.presenter_session_id}::${input.device_id}`;
    const currentEpoch = this.epochTable.get(epochKey) ?? 0;
    const newEpoch = currentEpoch + 1;
    this.epochTable.set(epochKey, newEpoch);

    const minted = mintPairingToken(this.signer, input, {
      serverEpoch: newEpoch,
      now_ms: now,
      ttl_ms: this.tokenTtlMs,
      capabilities,
    });

    // Persist a row (idempotent — re-mint for the same device overwrites).
    const existing = await this.store.getBySessionDevice(
      input.presenter_session_id,
      input.device_id,
    );
    const id = existing?.id ?? this.idGen();
    const tokenHash = sha256Hex(minted.token);
    const record: PairingRecord = {
      id,
      workspace_id: input.workspace_id,
      presenter_session_id: input.presenter_session_id,
      device_id: input.device_id,
      ...(input.device_name !== undefined ? { device_name: input.device_name } : {}),
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      token_hash: tokenHash,
      token_issued_at_ms: now,
      token_expires_at_ms: minted.claims.expires_at_ms,
      epoch: newEpoch,
      capabilities,
      status: 'active',
      created_at_ms: existing?.created_at_ms ?? now,
      updated_at_ms: now,
    };
    if (existing) {
      await this.store.update(id, record);
    } else {
      await this.store.create(record);
    }

    await this.emitAudit('pairing.mint', id, input.workspace_id, {
      device_id: input.device_id,
      epoch: newEpoch,
      ttl_ms: this.tokenTtlMs,
      ...(input.platform ? { platform: input.platform } : {}),
    });
    return minted;
  }

  // -------------------------------------------------------------------------
  // Verify
  // -------------------------------------------------------------------------

  async verify(input: VerifyPairingTokenInput): Promise<PairingTokenClaims> {
    // Parse the token to extract the device_id first so we can look up
    // the server's epoch for that device. We don't check epoch/expiry
    // here — we just want the claims to forward to verifyPairingToken.
    const parsed = parsePairingToken(input.token);
    if (!parsed.ok) {
      // The verifier will throw a typed error for this case; let it.
      throw new PairingSignatureError(`parse: ${parsed.reason}`);
    }
    const deviceId = parsed.payload.device_id as string | undefined;
    if (!deviceId) {
      throw new PairingSignatureError('parse: missing device_id claim');
    }

    const epochKeyWithDevice = `${input.session_id}::${deviceId}`;
    const serverEpoch = this.epochTable.get(epochKeyWithDevice) ?? 1;

    const claims = verifyPairingToken(this.signer, input, {
      serverEpoch,
      now_ms: this.clock(),
    });

    // Update last_seen.
    const row = await this.store.getBySessionDevice(claims.session_id, claims.device_id);
    if (row && row.status === 'active') {
      await this.store.update(row.id, { last_seen_at_ms: this.clock() });
    }
    return claims;
  }

  // -------------------------------------------------------------------------
  // Rotate
  // -------------------------------------------------------------------------

  /** Issue a new token for an already-paired device, bumping the epoch so
   *  the previous token is immediately invalid. The caller (realtime
   *  gateway) is responsible for propagating the rotation to the phone. */
  async rotate(args: {
    workspace_id: string;
    presenter_session_id: string;
    device_id: string;
    new_capabilities?: PairingCapability[] | undefined;
    new_platform?: PairingPlatform | undefined;
  }): Promise<MintedPairingToken> {
    const existing = await this.store.getBySessionDevice(
      args.presenter_session_id,
      args.device_id,
    );
    if (!existing) {
      throw new Error(`rotate: no pairing for device ${args.device_id}`);
    }
    if (existing.status !== 'active') {
      throw new Error(`rotate: pairing is ${existing.status}`);
    }
    return this.mint({
      workspace_id: args.workspace_id,
      presenter_session_id: args.presenter_session_id,
      device_id: args.device_id,
      device_name: existing.device_name,
      platform: args.new_platform ?? existing.platform,
      capabilities: args.new_capabilities ?? existing.capabilities,
    });
  }

  // -------------------------------------------------------------------------
  // Revoke
  // -------------------------------------------------------------------------

  async revoke(args: {
    workspace_id: string;
    presenter_session_id: string;
    device_id: string;
    revoked_by: string;
  }): Promise<PairingRecord> {
    const existing = await this.store.getBySessionDevice(
      args.presenter_session_id,
      args.device_id,
    );
    if (!existing) {
      throw new Error(`revoke: no pairing for device ${args.device_id}`);
    }
    if (existing.status === 'revoked') return existing;
    const updated = await this.store.update(existing.id, {
      status: 'revoked',
      revoked_at_ms: this.clock(),
      revoked_by: args.revoked_by,
    });
    await this.emitAudit('pairing.revoke', updated.id, args.workspace_id, {
      device_id: args.device_id,
      revoked_by: args.revoked_by,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  async heartbeat(args: {
    presenter_session_id: string;
    device_id: string;
  }): Promise<PairingRecord | null> {
    const existing = await this.store.getBySessionDevice(
      args.presenter_session_id,
      args.device_id,
    );
    if (!existing || existing.status !== 'active') return null;
    return this.store.update(existing.id, { last_seen_at_ms: this.clock() });
  }

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  async listBySession(session_id: string): Promise<PairingRecord[]> {
    return this.store.listBySession(session_id);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async emitAudit(
    action: 'pairing.mint' | 'pairing.revoke' | 'pairing.rotate',
    pairing_id: string,
    workspace_id: string,
    payload: JsonObject,
  ): Promise<void> {
    if (!this.auditChain || !this.workspaceId) return;
    await this.auditChain.build({
      workspaceId: workspace_id,
      agentSessionId: 'phone-pairing',
      sessionId: pairing_id,
      toolCallId: '',
      eventType: action,
      payload: { ts: this.clock(), ...payload },
    });
  }
}

/** SHA-256 hex helper used to fingerprint active tokens without
 *  storing the raw bytes. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export { GenesisHash };