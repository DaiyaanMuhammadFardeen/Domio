/**
 * MCP capability check (Phase 19 Wave 5 — WS-MKT-9).
 *
 * Pure function to verify MCP capabilities.
 * No I/O, no side effects.
 */

import type { McpCapability, McpToolInput } from '../types.js';
import { McpPermissionDeniedError } from '../types.js';

/**
 * Check if a workspace has the required MCP capability.
 * Throws McpPermissionDeniedError if capability is not granted.
 */
export function checkMcpCapability(
  _workspaceId: string,
  capability: McpCapability,
  grantedCapabilities: readonly McpCapability[],
): void {
  if (!grantedCapabilities.includes(capability)) {
    throw new McpPermissionDeniedError(capability);
  }
}

/**
 * Validate MCP tool input.
 * Returns errors array (empty = valid).
 */
export function validateMcpToolInput(
  input: McpToolInput,
): Array<{ level: 'error' | 'warning'; code: string; message: string }> {
  const errors: Array<{ level: 'error' | 'warning'; code: string; message: string }> = [];

  if (!input.workspaceId) {
    errors.push({
      level: 'error',
      code: 'MISSING_WORKSPACE_ID',
      message: 'workspaceId is required',
    });
  }
  if (!input.actorId) {
    errors.push({ level: 'error', code: 'MISSING_ACTOR_ID', message: 'actorId is required' });
  }
  if (!input.tool) {
    errors.push({ level: 'error', code: 'MISSING_TOOL', message: 'tool name is required' });
  }
  if (!input.params || typeof input.params !== 'object') {
    errors.push({ level: 'error', code: 'MISSING_PARAMS', message: 'params object is required' });
  }

  return errors;
}
