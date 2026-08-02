/**
 * Audit helpers — wraps service calls with automatic audit logging for
 * agent-initiated write operations.
 */

import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { uuid } from '../crypto/index.js';
import type { AuditRow } from '../store/interface.js';

export interface AuditContext {
  agentId: string;
  workspaceId?: string;
}

/**
 * Runs `fn`, and on success appends an audit row tagging the actor as
 * 'agent' when `ctx.agentId` is present.  Errors are re-thrown without
 * an audit row (we only audit successful writes).
 */
export async function withAudit<T>(
  deps: ServiceDeps,
  ctx: AuditContext,
  action: string,
  resourceType: string,
  resourceId: string,
  fn: () => Promise<T>,
  detail: Record<string, unknown> = {},
): Promise<T> {
  const result = await fn();

  await deps.store.appendAudit({
    id: uuid(),
    actorId: ctx.agentId,
    actorKind: 'agent',
    action,
    resourceType,
    resourceId,
    detail,
    createdAt: nowMs(deps),
  });

  return result;
}

export interface ListAgentActionsInput {
  agentId?: string;
  limit?: number;
}

/**
 * List audit rows, optionally filtered by agent ID.
 * Uses store.listAudit (which filters by actorKind) then narrows by actorId.
 */
export async function listAgentActions(
  deps: ServiceDeps,
  input: ListAgentActionsInput = {},
): Promise<AuditRow[]> {
  const limit = input.limit ?? 50;
  const rows = await deps.store.listAudit('agent', limit);
  if (input.agentId) {
    return rows.filter((r) => r.actorId === input.agentId);
  }
  return rows;
}
