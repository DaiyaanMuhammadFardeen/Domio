/**
 * @domio/presenter-session — audit key derivation.
 *
 * The hash-chained audit log uses per-tenant HMAC keys. This helper derives
 * a tenant-scoped sub-key from a workspace id, ensuring keys are never
 * shared across tenants.
 */

import { createHash, createHmac } from 'crypto';

export interface AuditKeyMaterial {
  /** 32+ byte HMAC key, raw bytes. */
  rootKey: Uint8Array;
}

export function deriveTenantAuditKey(
  material: AuditKeyMaterial,
  workspaceId: string,
): Uint8Array {
  if (!material.rootKey || material.rootKey.length < 32) {
    throw new Error('deriveTenantAuditKey: rootKey must be >= 32 bytes');
  }
  if (!workspaceId) {
    throw new Error('deriveTenantAuditKey: workspaceId is required');
  }
  // HKDF-Extract emulation: HMAC the workspace id with the root key, then
  // expand to 32 bytes via SHA-256. This is sufficient for our audit chain.
  const prk = createHmac('sha256', material.rootKey)
    .update(`domio/presenter-session/audit/v1:${workspaceId}`)
    .digest();
  // Expand (single block, 32 bytes).
  return createHash('sha256').update(prk).update('audit-v1').digest();
}

/** Helper for tests — generates a deterministic 32-byte key from a seed. */
export function testAuditKey(seed: string): Uint8Array {
  return createHash('sha256').update(`domio/test/audit/${seed}`).digest();
}