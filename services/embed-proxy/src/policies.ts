/**
 * Embed proxy — embed policy CRUD (Phase 11).
 *
 * Manages per-workspace embed policies that control:
 *  - allowed origins (origin allowlist for frame-ancestors)
 *  - sandbox flags (iframe sandbox attribute)
 *  - JWT passthrough requirements
 *  - trap-focus for kiosk embeds
 *
 * Public surface:
 *  - {@link EmbedPolicy}, {@link CreatePolicyInput}, {@link UpdatePolicyInput}
 *  - {@link EmbedPolicyService} — in-memory CRUD store
 *  - {@link PolicyNotFoundError}
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const SANDBOX_FLAGS_ENUM = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-modals',
  'allow-popups-to-escape-sandbox',
  'allow-top-navigation',
] as const;

export type SandboxFlag = (typeof SANDBOX_FLAGS_ENUM)[number];

export const VALID_SANDBOX_FLAGS = new Set<string>(SANDBOX_FLAGS_ENUM);

export interface EmbedPolicy {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly allowedOrigins: readonly string[];
  readonly sandboxFlags: string;
  readonly jwtRequired: boolean;
  readonly jwtAudience: string | null;
  readonly trapFocus: boolean;
  readonly createdAt: Date;
}

export interface CreatePolicyInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly allowedOrigins?: readonly string[];
  readonly sandboxFlags?: string;
  readonly jwtRequired?: boolean;
  readonly jwtAudience?: string | null;
  readonly trapFocus?: boolean;
}

export interface UpdatePolicyInput {
  readonly name?: string;
  readonly allowedOrigins?: readonly string[];
  readonly sandboxFlags?: string;
  readonly jwtRequired?: boolean;
  readonly jwtAudience?: string | null;
  readonly trapFocus?: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PolicyNotFoundError extends Error {
  readonly code = 'POLICY_NOT_FOUND' as const;
  constructor(public readonly policyId: string) {
    super(`Embed policy not found: ${policyId}`);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyValidationError extends Error {
  readonly code = 'POLICY_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCreateInput(input: CreatePolicyInput): void {
  if (!input.workspaceId) throw new PolicyValidationError('workspaceId is required');
  if (!input.name) throw new PolicyValidationError('name is required');
  if (input.sandboxFlags !== undefined) validateSandboxFlags(input.sandboxFlags);
  if (input.allowedOrigins !== undefined) {
    if (!Array.isArray(input.allowedOrigins))
      throw new PolicyValidationError('allowedOrigins must be an array');
    for (const origin of input.allowedOrigins) {
      if (typeof origin !== 'string')
        throw new PolicyValidationError('allowedOrigins entries must be strings');
    }
  }
}

export function validateUpdateInput(input: UpdatePolicyInput): void {
  if (input.sandboxFlags !== undefined) validateSandboxFlags(input.sandboxFlags);
  if (input.allowedOrigins !== undefined) {
    if (!Array.isArray(input.allowedOrigins))
      throw new PolicyValidationError('allowedOrigins must be an array');
    for (const origin of input.allowedOrigins) {
      if (typeof origin !== 'string')
        throw new PolicyValidationError('allowedOrigins entries must be strings');
    }
  }
}

function validateSandboxFlags(flags: string): void {
  const parts = flags.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (!VALID_SANDBOX_FLAGS.has(part)) {
      throw new PolicyValidationError(`Invalid sandbox flag: "${part}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

let policyCounter = 0;

export class EmbedPolicyService {
  private readonly store = new Map<string, EmbedPolicy>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  listByWorkspace(workspaceId: string): EmbedPolicy[] {
    const result: EmbedPolicy[] = [];
    for (const policy of this.store.values()) {
      if (policy.workspaceId === workspaceId) result.push(policy);
    }
    return result;
  }

  getById(id: string): EmbedPolicy | null {
    return this.store.get(id) ?? null;
  }

  create(input: CreatePolicyInput): EmbedPolicy {
    validateCreateInput(input);
    policyCounter++;
    const id = `pol_${policyCounter.toString(36).padStart(6, '0')}`;
    const now = this.clock();
    const policy: EmbedPolicy = {
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      allowedOrigins: input.allowedOrigins ?? [],
      sandboxFlags: input.sandboxFlags ?? 'allow-scripts allow-same-origin allow-forms',
      jwtRequired: input.jwtRequired ?? true,
      jwtAudience: input.jwtAudience ?? null,
      trapFocus: input.trapFocus ?? false,
      createdAt: now,
    };
    this.store.set(id, policy);
    return policy;
  }

  update(id: string, input: UpdatePolicyInput): EmbedPolicy {
    validateUpdateInput(input);
    const existing = this.store.get(id);
    if (!existing) throw new PolicyNotFoundError(id);
    const updated: EmbedPolicy = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.allowedOrigins !== undefined ? { allowedOrigins: input.allowedOrigins } : {}),
      ...(input.sandboxFlags !== undefined ? { sandboxFlags: input.sandboxFlags } : {}),
      ...(input.jwtRequired !== undefined ? { jwtRequired: input.jwtRequired } : {}),
      ...(input.jwtAudience !== undefined ? { jwtAudience: input.jwtAudience } : {}),
      ...(input.trapFocus !== undefined ? { trapFocus: input.trapFocus } : {}),
    };
    this.store.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  /**
   * Resolve a policy for a given workspace+deck path.
   * In a real system this would look up per-deck overrides;
   * here we return the workspace-level policy.
   */
  resolveForPath(_workspaceId: string, _deckPath: string): EmbedPolicy | null {
    // For now, return the first policy for the workspace
    const policies = this.listByWorkspace(_workspaceId);
    return policies[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Default policy (deny-all)
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY: EmbedPolicy = {
  id: '__default__',
  workspaceId: '',
  name: 'default-deny-all',
  allowedOrigins: [],
  sandboxFlags: 'allow-scripts allow-same-origin allow-forms',
  jwtRequired: true,
  jwtAudience: null,
  trapFocus: false,
  createdAt: new Date(0),
};
