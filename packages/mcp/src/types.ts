/**
 * @domio/mcp — Capability-claim gating.
 *
 * The MCP server exposes tools grouped by claim-level capability
 * (see @domio/agent-schema Capability). A tool is only callable when
 * the agent has presented the matching claim to the router. This
 * module provides:
 *
 *   - `Capability` re-export so MCP code reads the capability list
 *     from the same source as the agent-schema package.
 *   - `GateDecision` — the outcome of a gate check.
 *   - `assertCapability()` — pure helper that returns a GateDecision
 *     given a set of claims and a required capability.
 *   - `gatedHandler()` — wraps an `McpTool` handler with the gate.
 *   - `GatedMcpRegistry` — in-memory registry with claim enforcement
 *     suitable for unit tests and the embedded MCP surface.
 *
 * Phase 11 — this module was added in W5 so every Phase 11 tool
 * (3D, media, embed, code, latex, map) is wrapped in the same
 * claim-gate that the existing surface uses.
 */

export {
  type Capability,
  type McpContext,
  type McpError,
  type McpTool,
  type AuditEntry,
  type AuditSource,
} from '@domio/agent-schema';

import type { Capability, McpContext, McpError, McpTool } from '@domio/agent-schema';

// ─── Gate decision ──────────────────────────────────────────────────

export type GateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly code: 'MISSING_CLAIM' | 'NO_TOOL' };

/**
 * Check whether `claims` contains the required `capability`.
 *
 * Pure function — no side effects. Tests can call it directly.
 */
export function assertCapability(
  claims: ReadonlySet<Capability> | readonly Capability[],
  capability: Capability,
): GateDecision {
  const set = claims instanceof Set ? claims : new Set(claims);
  if (set.has(capability)) return { allowed: true };
  return {
    allowed: false,
    reason: `Missing capability claim "${capability}"`,
    code: 'MISSING_CLAIM',
  };
}

/**
 * Wrap an McpTool so its handler only runs when the calling agent's
 * claims include the tool's capability. Returns the same tool but
 * with a gate-aware handler.
 */
export function gatedHandler<I, O>(
  tool: McpTool<I, O>,
): McpTool<I, O> {
  const original = tool.handler;
  return {
    ...tool,
    handler: async (ctx: McpContext, input: I): Promise<O> => {
      const claims = ctx.claims ?? new Set<Capability>();
      const decision = assertCapability(claims, tool.capability);
      if (!decision.allowed) {
        const err: McpError = {
          code: 'PERMISSION_DENIED',
          message: decision.reason,
        };
        throw err;
      }
      return original(ctx, input);
    },
  };
}

/**
 * Optional `claims` on the McpContext — agents present their claim
 * set when calling. The router is expected to populate this from the
 * agent's signed claim token.
 */
declare module '@domio/agent-schema' {
  interface McpContext {
    readonly claims?: ReadonlySet<Capability> | readonly Capability[];
  }
}

// ─── Registry ───────────────────────────────────────────────────────

export interface GatedMcpRegistry {
  /** Register a tool; replaces any existing tool with the same name. */
  register<I, O>(tool: McpTool<I, O>): void;
  /** Get a registered tool by name. */
  get(name: string): McpTool<unknown, unknown> | null;
  /** List all registered tool names. */
  list(): readonly string[];
  /** Call a tool with claim gating. Throws McpError on failure. */
  call<I, O>(name: string, ctx: McpContext, input: I): Promise<O>;
}

/**
 * Build a fresh in-memory MCP registry with claim gating.
 */
export function createGatedMcpRegistry(): GatedMcpRegistry {
  const tools = new Map<string, McpTool<unknown, unknown>>();
  return {
    register<I, O>(tool: McpTool<I, O>): void {
      tools.set(tool.name, tool as McpTool<unknown, unknown>);
    },
    get(name: string): McpTool<unknown, unknown> | null {
      return tools.get(name) ?? null;
    },
    list(): readonly string[] {
      return [...tools.keys()].sort();
    },
    async call<I, O>(name: string, ctx: McpContext, input: I): Promise<O> {
      const tool = tools.get(name);
      if (!tool) {
        const err: McpError = {
          code: 'NOT_FOUND',
          message: `Tool "${name}" not registered`,
        };
        throw err;
      }
      const claims = ctx.claims ?? [];
      const decision = assertCapability(claims, tool.capability);
      if (!decision.allowed) {
        const err: McpError = {
          code: 'PERMISSION_DENIED',
          message: decision.reason,
        };
        throw err;
      }
      return tool.handler(ctx, input) as Promise<O>;
    },
  };
}