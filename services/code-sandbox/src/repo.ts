/**
 * Code Sandbox — in-memory policy repository.
 *
 * Stores sandbox policies (CPU/memory caps, capability flags, module allowlists)
 * in a simple Map. Used for dev + tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxPolicy {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly maxCpuMs: number;
  readonly maxMemoryMb: number;
  readonly allowNetwork: boolean;
  readonly allowDom: boolean;
  readonly allowConsole: boolean;
  readonly allowImport: boolean;
  readonly moduleAllowlist: readonly string[];
  readonly createdAt: string;
  schemaVersion: string;
}

export interface SandboxPolicyInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly maxCpuMs?: number;
  readonly maxMemoryMb?: number;
  readonly allowNetwork?: boolean;
  readonly allowDom?: boolean;
  readonly allowConsole?: boolean;
  readonly allowImport?: boolean;
  readonly moduleAllowlist?: readonly string[];
}

export interface SandboxPolicyPatch {
  readonly name?: string;
  readonly maxCpuMs?: number;
  readonly maxMemoryMb?: number;
  readonly allowNetwork?: boolean;
  readonly allowDom?: boolean;
  readonly allowConsole?: boolean;
  readonly allowImport?: boolean;
  readonly moduleAllowlist?: readonly string[];
}

export class SandboxPolicyNotFoundError extends Error {
  readonly code = 'POLICY_NOT_FOUND' as const;
  constructor(id: string) {
    super(`Sandbox policy ${id} not found`);
    this.name = 'SandboxPolicyNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const POLICY_DEFAULTS = {
  maxCpuMs: 8000,
  maxMemoryMb: 64,
  allowNetwork: false,
  allowDom: false,
  allowConsole: true,
  allowImport: false,
  moduleAllowlist: [] as readonly string[],
} as const;

// ---------------------------------------------------------------------------
// In-memory repository
// ---------------------------------------------------------------------------

export class InMemoryPolicyRepository {
  private readonly store = new Map<string, SandboxPolicy>();

  async findById(id: string): Promise<SandboxPolicy | undefined> {
    return this.store.get(id);
  }

  async listByWorkspace(workspaceId: string): Promise<SandboxPolicy[]> {
    const result: SandboxPolicy[] = [];
    for (const p of this.store.values()) {
      if (p.workspaceId === workspaceId) result.push(p);
    }
    return result;
  }

  async insert(policy: SandboxPolicy): Promise<void> {
    this.store.set(policy.id, policy);
  }

  async update(id: string, patch: SandboxPolicyPatch): Promise<SandboxPolicy> {
    const existing = this.store.get(id);
    if (!existing) throw new SandboxPolicyNotFoundError(id);
    const updated: SandboxPolicy = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.maxCpuMs !== undefined ? { maxCpuMs: patch.maxCpuMs } : {}),
      ...(patch.maxMemoryMb !== undefined ? { maxMemoryMb: patch.maxMemoryMb } : {}),
      ...(patch.allowNetwork !== undefined ? { allowNetwork: patch.allowNetwork } : {}),
      ...(patch.allowDom !== undefined ? { allowDom: patch.allowDom } : {}),
      ...(patch.allowConsole !== undefined ? { allowConsole: patch.allowConsole } : {}),
      ...(patch.allowImport !== undefined ? { allowImport: patch.allowImport } : {}),
      ...(patch.moduleAllowlist !== undefined ? { moduleAllowlist: patch.moduleAllowlist } : {}),
    };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new SandboxPolicyNotFoundError(id);
    this.store.delete(id);
  }
}
