/**
 * @domio/annotation-engine — per-tenant audit key resolution.
 *
 * In production the root key is fetched from the secret store and the
 * per-tenant key is derived via HKDF in {@link deriveAuditKey}. This
 * module exposes a single function so tests can stub the root key.
 */
export interface AuditKeyResolver {
    rootKey(): Promise<string>;
}
export declare function deriveAuditKey(rootKey: string, workspaceId: string): Buffer;
export declare class StaticAuditKeyResolver implements AuditKeyResolver {
    private readonly root;
    constructor(root: string);
    rootKey(): Promise<string>;
}
//# sourceMappingURL=key.d.ts.map