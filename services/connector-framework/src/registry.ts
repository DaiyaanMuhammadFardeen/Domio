/**
 * Connector framework — adapter registry (Phase 08).
 *
 * Version-aware registry that maps (connector_id, semver) to adapter
 * implementations.  Supports pinning (exact match), caret ranges (^1.x),
 * and deprecated adapters.
 */

import type { ConnectorAdapter, ConnectorId, AdapterVersionInfo, AuthKind } from './types.js';
import { AdapterVersionMismatchError } from './types.js';

export interface RegisteredAdapter {
  readonly adapter: ConnectorAdapter;
  readonly version: string;
  readonly connector_id: ConnectorId;
  readonly auth_kind: AuthKind;
  readonly deprecated: boolean;
  readonly deprecated_since: string | undefined;
  readonly replaced_by: string | undefined;
}

export class AdapterRegistry {
  private entries = new Map<string, RegisteredAdapter[]>();

  private key(connector_id: ConnectorId): string {
    return connector_id;
  }

  private versionCompare(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  /**
   * Register a connector adapter at a given version.
   * If an adapter at the same (connector_id, version) already exists,
   * it is replaced (useful for tests).
   */
  register(
    adapter: ConnectorAdapter,
    opts?: { deprecated?: boolean; deprecated_since?: string; replaced_by?: string },
  ): void {
    const list = this.entries.get(this.key(adapter.connector_id)) ?? [];
    const existing = list.findIndex((e) => e.version === adapter.version);
    const entry: RegisteredAdapter = {
      adapter,
      version: adapter.version,
      connector_id: adapter.connector_id,
      auth_kind: adapter.auth_kind,
      deprecated: opts?.deprecated ?? false,
      deprecated_since: opts?.deprecated_since,
      replaced_by: opts?.replaced_by,
    };
    if (existing >= 0) {
      list[existing] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => this.versionCompare(a.version, b.version));
    this.entries.set(this.key(adapter.connector_id), list);
  }

  /**
   * Resolve an adapter by connector_id and pinned version.
   *
   * Version resolution:
   * - Exact match (e.g. "1.2.0") → returns that version.
   * - Caret range (e.g. "^1.2.0") → returns latest compatible (≥1.2.0, <2.0.0).
   * - If nothing matches, throws AdapterVersionMismatchError.
   */
  resolve(connector_id: ConnectorId, pinned_version: string): RegisteredAdapter {
    const list = this.entries.get(this.key(connector_id)) ?? [];
    if (list.length === 0) {
      throw new AdapterVersionMismatchError(connector_id, pinned_version, []);
    }

    // Caret range: ^X.Y.Z → match >= X.Y.Z, < (X+1).0.0
    const caretMatch = pinned_version.match(/^\^(\d+)\./);
    if (caretMatch) {
      const major = Number(caretMatch[1]);
      const candidates = list.filter((e) => {
        const parts = e.version.split('.').map(Number);
        return (
          (parts[0] ?? 0) === major && this.versionCompare(e.version, pinned_version.slice(1)) >= 0
        );
      });
      if (candidates.length === 0) {
        throw new AdapterVersionMismatchError(
          connector_id,
          pinned_version,
          list.map((e) => e.version),
        );
      }
      return candidates[candidates.length - 1]!;
    }

    // Exact match
    const exact = list.find((e) => e.version === pinned_version);
    if (exact) return exact;

    throw new AdapterVersionMismatchError(
      connector_id,
      pinned_version,
      list.map((e) => e.version),
    );
  }

  /** List all registered versions for a connector. */
  versions(connector_id: ConnectorId): AdapterVersionInfo[] {
    const list = this.entries.get(this.key(connector_id)) ?? [];
    return list.map((e) => ({
      connector_id: e.connector_id,
      version: e.version,
      auth_kind: e.auth_kind,
      deprecated: e.deprecated,
      ...(e.deprecated_since !== undefined ? { deprecated_since: e.deprecated_since } : {}),
      ...(e.replaced_by !== undefined ? { replaced_by: e.replaced_by } : {}),
    }));
  }

  /** List all registered connectors. */
  list(): AdapterVersionInfo[] {
    const out: AdapterVersionInfo[] = [];
    for (const list of this.entries.values()) {
      for (const e of list) {
        out.push({
          connector_id: e.connector_id,
          version: e.version,
          auth_kind: e.auth_kind,
          deprecated: e.deprecated,
          ...(e.deprecated_since !== undefined ? { deprecated_since: e.deprecated_since } : {}),
          ...(e.replaced_by !== undefined ? { replaced_by: e.replaced_by } : {}),
        });
      }
    }
    return out;
  }

  /** Check if a connector_id is registered at all. */
  has(connector_id: ConnectorId): boolean {
    return (
      this.entries.has(this.key(connector_id)) &&
      (this.entries.get(this.key(connector_id))?.length ?? 0) > 0
    );
  }
}
