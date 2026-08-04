/**
 * Capability router for MCP tools.
 * In-memory grant table; can be wired to a real DB later.
 */
import type { Capability } from '@domio/agent-schema';

interface RouterState {
  grants: Map<string, Set<Capability>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __domioMcpRouterState: RouterState | undefined;
}

function getState(): RouterState {
  if (!globalThis.__domioMcpRouterState) {
    globalThis.__domioMcpRouterState = { grants: new Map() };
  }
  return globalThis.__domioMcpRouterState;
}

export interface ClaimResult {
  readonly granted: boolean;
  readonly reason?: string;
}

export function claimCapability(agentId: string, capability: Capability): ClaimResult {
  if (typeof agentId !== 'string' || agentId.length === 0) {
    return { granted: false, reason: 'agentId must be a non-empty string' };
  }
  const state = getState();
  const set = state.grants.get(agentId);
  if (set?.has(capability)) return { granted: true };
  return { granted: false, reason: `agent "${agentId}" is not granted "${capability}"` };
}

export function grantCapability(agentId: string, capability: Capability): void {
  const state = getState();
  let set = state.grants.get(agentId);
  if (!set) {
    set = new Set();
    state.grants.set(agentId, set);
  }
  set.add(capability);
}

export function revokeCapability(agentId: string, capability: Capability): void {
  getState().grants.get(agentId)?.delete(capability);
}

export function listCapabilities(agentId: string): readonly Capability[] {
  const set = getState().grants.get(agentId);
  return set ? Array.from(set) : [];
}

export function resetRouter(): void {
  const state = getState();
  state.grants.clear();
}