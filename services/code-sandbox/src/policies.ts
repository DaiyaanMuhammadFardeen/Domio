/**
 * Code Sandbox — policy service.
 *
 * CRUD operations for sandbox policies with schema validation.
 */

import {
  type SandboxPolicy,
  type SandboxPolicyInput,
  type SandboxPolicyPatch,
  SandboxPolicyNotFoundError,
  type InMemoryPolicyRepository,
  POLICY_DEFAULTS,
} from './repo.js';
import { validateCreatePolicy, validateUpdatePolicy, type ValidationResult } from './schemas.js';

export { SandboxPolicyNotFoundError } from './repo.js';
export type { SandboxPolicy, SandboxPolicyInput, SandboxPolicyPatch } from './repo.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface SandboxPolicyServiceOptions {
  readonly repo: InMemoryPolicyRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

const DEFAULT_CHARS = '0123456789ABCDEFGHJKMNP-TV-Z';
const defaultId = (): string => {
  let out = '';
  for (let i = 0; i < 26; i++)
    out += DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)]!;
  return out;
};

const defaultClock = (): Date => new Date();

export class SandboxPolicyService {
  private readonly repo: InMemoryPolicyRepository;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: SandboxPolicyServiceOptions) {
    this.repo = opts.repo;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  async createPolicy(
    input: SandboxPolicyInput,
  ): Promise<{ policy: SandboxPolicy; validation: ValidationResult }> {
    const validation = validateCreatePolicy(input);
    if (!validation.valid) {
      return { policy: null as unknown as SandboxPolicy, validation };
    }

    const id = this.idGen();
    const policy: SandboxPolicy = {
      id,
      schemaVersion: '1.0.0',
      workspaceId: input.workspaceId,
      name: input.name,
      maxCpuMs: input.maxCpuMs ?? POLICY_DEFAULTS.maxCpuMs,
      maxMemoryMb: input.maxMemoryMb ?? POLICY_DEFAULTS.maxMemoryMb,
      allowNetwork: input.allowNetwork ?? POLICY_DEFAULTS.allowNetwork,
      allowDom: input.allowDom ?? POLICY_DEFAULTS.allowDom,
      allowConsole: input.allowConsole ?? POLICY_DEFAULTS.allowConsole,
      allowImport: input.allowImport ?? POLICY_DEFAULTS.allowImport,
      moduleAllowlist: input.moduleAllowlist ?? [...POLICY_DEFAULTS.moduleAllowlist],
      createdAt: this.clock().toISOString(),
    };

    await this.repo.insert(policy);
    return { policy, validation: { valid: true, errors: [] } };
  }

  async getPolicy(id: string): Promise<SandboxPolicy> {
    const policy = await this.repo.findById(id);
    if (!policy) throw new SandboxPolicyNotFoundError(id);
    return policy;
  }

  async listPolicies(workspaceId: string): Promise<SandboxPolicy[]> {
    return this.repo.listByWorkspace(workspaceId);
  }

  async updatePolicy(
    id: string,
    patch: SandboxPolicyPatch,
  ): Promise<{ policy: SandboxPolicy; validation: ValidationResult }> {
    const validation = validateUpdatePolicy(patch);
    if (!validation.valid) {
      return { policy: null as unknown as SandboxPolicy, validation };
    }

    const policy = await this.repo.update(id, patch);
    return { policy, validation: { valid: true, errors: [] } };
  }

  async deletePolicy(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
