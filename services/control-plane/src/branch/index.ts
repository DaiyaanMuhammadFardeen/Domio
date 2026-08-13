/** Phase 05 branch module — public surface. */
export * from './dal.js';
export * from './service.js';
export * from './lineage.js';
export * from './diff.js';
export { resolveConflicts, MissingManualResolutionsError } from './resolver.js';
export type { ResolutionStrategy, ResolveRequest, ResolveResult } from './resolver.js';
export * from './merge_request_dal.js';
export {
  MergeService,
  ConflictsUnresolvedError,
  TargetBranchArchivedError,
  NoChangesToMergeError,
  SourceTargetMismatchError,
} from './merge.js';
export type {
  CreateMergeRequestArgs,
  ResolveMergeRequestArgs,
  CommitMergeRequestArgs,
} from './merge.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
