/**
 * @domio/annotation-engine — per-tenant audit key resolution.
 *
 * In production the root key is fetched from the secret store and the
 * per-tenant key is derived via HKDF in {@link deriveAuditKey}. This
 * module exposes a single function so tests can stub the root key.
 */
import { createHmac } from 'node:crypto';
const DEFAULT_INFO = 'domio/annotation-engine/audit/v1';
export function deriveAuditKey(rootKey, workspaceId) {
    const info = `${DEFAULT_INFO}:${workspaceId}`;
    const salt = Buffer.alloc(32, 0);
    const prk = createHmac('sha256', salt).update(rootKey).digest();
    let prev = Buffer.alloc(0);
    let out = Buffer.alloc(0);
    let counter = 1;
    while (out.length < 32) {
        prev = createHmac('sha256', prk)
            .update(Buffer.concat([prev, Buffer.from(info, 'utf8'), Buffer.from([counter++])]))
            .digest();
        out = Buffer.concat([out, prev]);
    }
    return out.subarray(0, 32);
}
export class StaticAuditKeyResolver {
    root;
    constructor(root) {
        this.root = root;
    }
    async rootKey() {
        return this.root;
    }
}
//# sourceMappingURL=key.js.map