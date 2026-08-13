/**
 * ResourceId — structured identifier that is also tenant-scoped.
 *
 * Kept as a plain TS type so it can be serialized to JSON without
 * Protobuf dependency. The wire-format shape lives in
 * `contracts/proto/domio/v1/common.proto` and the generated client is
 * used for gRPC/REST paths; this type covers in-process usage.
 */

export interface ResourceIdLike {
  kind: string;
  org_id: string;
  tenant_id: string;
  id: string;
}

const KIND_PATTERN = /^[a-z][a-z0-9_]*$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidResourceId(rid: unknown): rid is ResourceIdLike {
  if (typeof rid !== 'object' || rid === null) return false;
  const r = rid as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    typeof r.org_id === 'string' &&
    typeof r.tenant_id === 'string' &&
    typeof r.id === 'string' &&
    KIND_PATTERN.test(r.kind) &&
    ID_PATTERN.test(r.org_id) &&
    ID_PATTERN.test(r.tenant_id) &&
    r.id.length > 0 &&
    r.id.length <= 128
  );
}

export function resourceIdToString(rid: ResourceIdLike): string {
  return `${rid.kind}/${rid.org_id}/${rid.tenant_id}/${rid.id}`;
}

export function parseResourceId(s: string): ResourceIdLike | null {
  const parts = s.split('/');
  if (parts.length !== 4) return null;
  const [kind, org_id, tenant_id, id] = parts;
  if (!kind || !org_id || !tenant_id || !id) return null;
  const rid: ResourceIdLike = { kind, org_id, tenant_id, id };
  return isValidResourceId(rid) ? rid : null;
}

/**
 * Generates a server-assigned id. Uses crypto.randomUUID under the hood.
 * For tenant-scoped ids, prefix with the tenant hash to keep locality.
 */
export function newId(): string {
  // Node 22 has globalThis.crypto.randomUUID in the WebCrypto API.
  return globalThis.crypto.randomUUID();
}

/**
 * Generates a URL-safe opaque token (e.g., for share links, capability
 * tokens, idempotency keys).
 */
export function newToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  // base64url without padding.
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
