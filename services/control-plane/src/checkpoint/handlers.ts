/**
 * Checkpoint REST handlers — Phase 05 C.1.
 *
 * Endpoints (matching `contracts/openapi/v1/checkpoints.yaml`):
 *
 *   - POST   /v1/decks/{deckId}/checkpoints
 *   - GET    /v1/decks/{deckId}/checkpoints
 *   - PATCH  /v1/decks/{deckId}/checkpoints/{checkpointId}
 *   - POST   /v1/decks/{deckId}/checkpoints/{checkpointId}/restore
 */

import type { ULID } from '@domio/schema';
import { HttpError, asHttpError } from '../branch/handlers.js';
import {
  type CheckpointRecord,
  type CheckpointKind,
  CheckpointAlreadyExistsError,
  CheckpointNotFoundError,
  CheckpointService,
  InvalidCheckpointNameError,
} from './service.js';

export interface CheckpointHandlerContext {
  checkpoints: CheckpointService;
  fetchDeckHead: (args: { deckId: ULID; branchId: string }) => Promise<number | null>;
}

export interface CheckpointResponse {
  checkpoint: CheckpointRecord;
  traceId?: string;
}

export interface ListCheckpointsResponse {
  checkpoints: CheckpointRecord[];
  traceId?: string;
}

export interface CreateCheckpointRequest {
  name: string;
  branchId?: string;
  parentCheckpointId?: string;
  actorId: string;
}

export interface RenameCheckpointRequest {
  newName: string;
}

export interface RestoreCheckpointResponse {
  newRevision: number;
  branchId: string;
  traceId?: string;
}

function mapCheckpointError(err: unknown): HttpError {
  if (err instanceof CheckpointNotFoundError) {
    return new HttpError(404, 'CHECKPOINT_NOT_FOUND', err.message, {
      deckId: err.deckId,
      checkpointId: err.checkpointId,
    });
  }
  if (err instanceof CheckpointAlreadyExistsError) {
    return new HttpError(409, 'DUPLICATE_NAME', err.message, {
      branchId: err.branchId,
      name: err.name,
    });
  }
  if (err instanceof InvalidCheckpointNameError) {
    return new HttpError(400, 'INVALID_NAME', err.message, { value: err.value });
  }
  return asHttpError(err);
}

export async function createCheckpoint(
  ctx: CheckpointHandlerContext,
  deckId: ULID,
  body: CreateCheckpointRequest,
  traceId?: string,
): Promise<CheckpointResponse> {
  const branchId = body.branchId ?? 'main';
  const revision = (await ctx.fetchDeckHead({ deckId, branchId })) ?? 0;
  try {
    const checkpoint = await ctx.checkpoints.create({
      deckId,
      branchId,
      name: body.name,
      parentCheckpointId: body.parentCheckpointId ?? null,
      revision,
      actorId: body.actorId,
      kind: 'named',
    });
    return { checkpoint, ...(traceId ? { traceId } : {}) };
  } catch (err) {
    throw mapCheckpointError(err);
  }
}

export async function listCheckpoints(
  ctx: CheckpointHandlerContext,
  deckId: ULID,
  filter: { branchId?: string; kind?: CheckpointKind },
  traceId?: string,
): Promise<ListCheckpointsResponse> {
  const checkpoints = await ctx.checkpoints.list(deckId, filter);
  return { checkpoints, ...(traceId ? { traceId } : {}) };
}

export async function renameCheckpoint(
  ctx: CheckpointHandlerContext,
  deckId: ULID,
  checkpointId: ULID,
  body: RenameCheckpointRequest,
  traceId?: string,
): Promise<CheckpointResponse> {
  try {
    const checkpoint = await ctx.checkpoints.rename(deckId, checkpointId, body.newName);
    return { checkpoint, ...(traceId ? { traceId } : {}) };
  } catch (err) {
    throw mapCheckpointError(err);
  }
}

export async function restoreCheckpoint(
  ctx: CheckpointHandlerContext,
  deckId: ULID,
  checkpointId: ULID,
  traceId?: string,
): Promise<RestoreCheckpointResponse> {
  try {
    const result = await ctx.checkpoints.restore(deckId, checkpointId);
    return {
      newRevision: result.newRevision,
      branchId: result.branchId,
      ...(traceId ? { traceId } : {}),
    };
  } catch (err) {
    throw mapCheckpointError(err);
  }
}
