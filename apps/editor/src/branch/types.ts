/**
 * Branch/MR types shared across the editor's branch UI.
 *
 * Mirrors the surface from `@domio/control-plane/branch` but kept as a
 * pure-types dependency so the editor can stub control-plane in
 * Storybook and the unit test runner without pulling in the pgx
 * stack.  Tests convert between these shapes and the canonical
 * control-plane types using trivial mappings.
 */

export type BranchStatus = 'active' | 'archived';

export interface BranchSummary {
  id: string;
  deckId: string;
  name: string;
  parentBranchId: string;
  status: BranchStatus;
  headRevision: number;
  baseCheckpointId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BranchLineage {
  branchId: string;
  ancestors: BranchSummary[];
}

export type MergeRequestStatus = 'open' | 'resolved' | 'merged' | 'closed';

export interface MergeRequestSummary {
  id: string;
  deckId: string;
  sourceBranchId: string;
  targetBranchId: string;
  status: MergeRequestStatus;
  sourceRevision: number;
  targetRevision: number;
  baseRevision: number;
  diffSummary: DiffSummary;
  resolutionStrategy: 'theirs' | 'ours' | 'manual' | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface DiffSummary {
  slides: { added: DiffSlideRef[]; removed: DiffSlideRef[]; modified: DiffSlideRef[] };
  elements: DiffElementChange[];
  conflicts: DiffConflict[];
}

export interface DiffSlideRef {
  slideId: string;
}

export interface DiffElementChange {
  slideId: string;
  path: string;
  kind: 'added' | 'modified' | 'removed';
  sourceValue?: unknown;
  targetValue?: unknown;
}

export interface DiffConflict {
  slideId: string;
  elementId: string;
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
  baseValue: unknown;
}

export interface CheckpointSummary {
  id: string;
  deckId: string;
  branchId: string;
  name: string;
  revision: number;
  parentId: string | null;
  createdBy: string;
  createdAt: string;
  kind: 'named' | 'auto';
}

export interface BranchClient {
  listBranches(deckId: string): Promise<BranchSummary[]>;
  createBranch(deckId: string, name: string, baseCheckpointId?: string): Promise<BranchSummary>;
  archiveBranch(deckId: string, branchId: string): Promise<BranchSummary>;
  checkout(
    deckId: string,
    branchId: string,
  ): Promise<{ branch: BranchSummary; resumeHlc: { physical: number; logical: number } }>;
  getLineage(deckId: string, branchId: string): Promise<BranchLineage>;
  listMergeRequests(deckId: string): Promise<MergeRequestSummary[]>;
  createMergeRequest(
    deckId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<MergeRequestSummary>;
  resolveMergeRequest(
    deckId: string,
    mrId: string,
    strategy: 'theirs' | 'ours' | 'manual',
    resolutions?: Record<string, unknown>,
  ): Promise<MergeRequestSummary>;
  commitMergeRequest(
    deckId: string,
    mrId: string,
    resolvedDeck: unknown,
  ): Promise<{ mergeRequest: MergeRequestSummary; newRevision: number }>;
  listCheckpoints(deckId: string, branchId?: string): Promise<CheckpointSummary[]>;
  createCheckpoint(deckId: string, name: string, branchId?: string): Promise<CheckpointSummary>;
  renameCheckpoint(
    deckId: string,
    checkpointId: string,
    newName: string,
  ): Promise<CheckpointSummary>;
  restoreCheckpoint(
    deckId: string,
    checkpointId: string,
  ): Promise<{ newRevision: number; branchId: string }>;
}

export class InMemoryBranchClient implements BranchClient {
  private readonly branches = new Map<string, BranchSummary>();
  private readonly mergeRequests = new Map<string, MergeRequestSummary>();
  private readonly checkpoints = new Map<string, CheckpointSummary>();
  private revision = 0;
  private readonly mainBranch: BranchSummary;
  constructor(deckId: string) {
    this.mainBranch = {
      id: 'main',
      deckId,
      name: 'main',
      parentBranchId: 'main',
      status: 'active',
      headRevision: 0,
      baseCheckpointId: null,
      createdBy: 'system',
      createdAt: new Date('2026-04-01T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-04-01T00:00:00Z').toISOString(),
    };
    this.branches.set('main', this.mainBranch);
  }
  async listBranches(): Promise<BranchSummary[]> {
    return Array.from(this.branches.values());
  }
  async createBranch(
    deckId: string,
    name: string,
    baseCheckpointId?: string,
  ): Promise<BranchSummary> {
    const id = `${name.replace(/[^a-z0-9]/gi, '_')}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const summary: BranchSummary = {
      id,
      deckId,
      name,
      parentBranchId: 'main',
      status: 'active',
      headRevision: this.mainBranch.headRevision,
      baseCheckpointId: baseCheckpointId ?? null,
      createdBy: 'user',
      createdAt: now,
      updatedAt: now,
    };
    this.branches.set(id, summary);
    return summary;
  }
  async archiveBranch(_deckId: string, branchId: string): Promise<BranchSummary> {
    const branch = this.branches.get(branchId);
    if (!branch) throw new Error(`Branch ${branchId} not found.`);
    if (branchId === 'main') throw new Error('Cannot archive main.');
    const next: BranchSummary = {
      ...branch,
      status: 'archived',
      updatedAt: new Date().toISOString(),
    };
    this.branches.set(branchId, next);
    return next;
  }
  async checkout(
    _deckId: string,
    branchId: string,
  ): Promise<{ branch: BranchSummary; resumeHlc: { physical: number; logical: number } }> {
    const branch = this.branches.get(branchId);
    if (!branch) throw new Error(`Branch ${branchId} not found.`);
    return { branch, resumeHlc: { physical: 0, logical: 0 } };
  }
  async getLineage(_deckId: string, branchId: string): Promise<BranchLineage> {
    const ancestors: BranchSummary[] = [];
    let cursor: string | null = branchId;
    for (let i = 0; i < 8 && cursor; i++) {
      const branch = this.branches.get(cursor);
      if (!branch) break;
      ancestors.push(branch);
      if (branch.parentBranchId === 'main' || branch.parentBranchId === branch.id) break;
      cursor = branch.parentBranchId;
    }
    return { branchId, ancestors };
  }
  async listMergeRequests(): Promise<MergeRequestSummary[]> {
    return Array.from(this.mergeRequests.values());
  }
  async createMergeRequest(
    deckId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<MergeRequestSummary> {
    const id = `mr_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const summary: MergeRequestSummary = {
      id,
      deckId,
      sourceBranchId,
      targetBranchId,
      status: 'open',
      sourceRevision: this.revision,
      targetRevision: this.revision,
      baseRevision: 0,
      diffSummary: {
        slides: { added: [], removed: [], modified: [] },
        elements: [],
        conflicts: [],
      },
      resolutionStrategy: null,
      resolvedBy: null,
      resolvedAt: null,
      createdBy: 'user',
      createdAt: now,
    };
    this.mergeRequests.set(id, summary);
    return summary;
  }
  async resolveMergeRequest(
    _deckId: string,
    mrId: string,
    strategy: 'theirs' | 'ours' | 'manual',
  ): Promise<MergeRequestSummary> {
    const mr = this.mergeRequests.get(mrId);
    if (!mr) throw new Error(`MR ${mrId} not found.`);
    const next: MergeRequestSummary = {
      ...mr,
      status: 'resolved',
      resolutionStrategy: strategy,
      resolvedBy: 'user',
      resolvedAt: new Date().toISOString(),
    };
    this.mergeRequests.set(mrId, next);
    return next;
  }
  async commitMergeRequest(
    _deckId: string,
    mrId: string,
  ): Promise<{ mergeRequest: MergeRequestSummary; newRevision: number }> {
    const mr = this.mergeRequests.get(mrId);
    if (!mr) throw new Error(`MR ${mrId} not found.`);
    const target = this.branches.get(mr.targetBranchId);
    if (!target) throw new Error(`Target branch ${mr.targetBranchId} missing.`);
    const newRevision = target.headRevision + 1;
    const updated: MergeRequestSummary = { ...mr, status: 'merged' };
    this.mergeRequests.set(mrId, updated);
    this.branches.set(mr.targetBranchId, { ...target, headRevision: newRevision });
    return { mergeRequest: updated, newRevision };
  }
  async listCheckpoints(_deckId: string, branchId?: string): Promise<CheckpointSummary[]> {
    const all = Array.from(this.checkpoints.values());
    return branchId ? all.filter((c) => c.branchId === branchId) : all;
  }
  async createCheckpoint(
    deckId: string,
    name: string,
    branchId = 'main',
  ): Promise<CheckpointSummary> {
    const id = `cp_${Math.random().toString(36).slice(2, 9)}`;
    const summary: CheckpointSummary = {
      id,
      deckId,
      branchId,
      name,
      revision: this.revision,
      parentId: null,
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      kind: 'named',
    };
    this.checkpoints.set(id, summary);
    return summary;
  }
  async renameCheckpoint(
    _deckId: string,
    checkpointId: string,
    newName: string,
  ): Promise<CheckpointSummary> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found.`);
    const updated: CheckpointSummary = { ...cp, name: newName };
    this.checkpoints.set(checkpointId, updated);
    return updated;
  }
  async restoreCheckpoint(
    _deckId: string,
    checkpointId: string,
  ): Promise<{ newRevision: number; branchId: string }> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found.`);
    this.revision += 1;
    return { newRevision: this.revision, branchId: cp.branchId };
  }
}
