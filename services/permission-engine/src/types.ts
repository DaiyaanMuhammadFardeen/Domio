/**
 * @domio/permission-engine — types and errors.
 *
 * Phase 18 W1. Hierarchical permission model with five resource types
 * (workspace → folder → project → deck → slide), deny-overrides, ancestry
 * blocking, temporal grants, group membership, and workspace role baselines.
 */

// ---------------------------------------------------------------------------
// Resource & principal types
// ---------------------------------------------------------------------------

export type ResourceType = 'workspace' | 'folder' | 'project' | 'deck' | 'slide';
export type PrincipalType = 'user' | 'group';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

/** Resource hierarchy — each entry maps to its parent (null = root). */
export const PARENT_MAP: Record<ResourceType, ResourceType | null> = {
  workspace: null,
  folder: 'workspace',
  project: 'folder',
  deck: 'project',
  slide: 'deck',
};

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export interface PermissionGrant {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly principalId: string;
  readonly principalType: PrincipalType;
  readonly capabilities: readonly string[];
  readonly isDeny: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface WorkspaceMember {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly capabilities: readonly string[];
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface GroupMembership {
  readonly groupId: string;
  readonly userId: string;
}

// ---------------------------------------------------------------------------
// Input / request types
// ---------------------------------------------------------------------------

export interface PermissionGrantInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly principalId: string;
  readonly principalType: PrincipalType;
  readonly capabilities: readonly string[];
  readonly isDeny?: boolean;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
  readonly createdBy: string;
}

export interface PermissionRequest {
  readonly principalId: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly capability: string;
  /** Point-in-time check — defaults to now. */
  readonly at?: Date;
}

// ---------------------------------------------------------------------------
// Evaluation result
// ---------------------------------------------------------------------------

export type PermissionDecision = 'allow' | 'deny';

export interface PermissionEvaluation {
  readonly allowed: boolean;
  readonly decision: PermissionDecision;
  readonly reason: string;
  readonly evaluatedAt: Date;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly principalId: string;
  readonly capability: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED' as const;
  constructor(
    public readonly principalId: string,
    public readonly capability: string,
    public readonly resourceType: ResourceType,
    public readonly resourceId: string,
  ) {
    super(
      `Permission denied: principal ${principalId} cannot ${capability} on ${resourceType}:${resourceId}`,
    );
    this.name = 'PermissionDeniedError';
  }
}

export class GrantNotFoundError extends Error {
  readonly code = 'GRANT_NOT_FOUND' as const;
  constructor(public readonly grantId: string) {
    super(`Grant ${grantId} not found`);
    this.name = 'GrantNotFoundError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
