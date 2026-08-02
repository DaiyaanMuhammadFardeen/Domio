/**
 * MCP Server adapter — protocol-neutral boundary.
 *
 * The actual JSON-RPC framing lives in the gateway layer.  This module
 * implements the tool-call boundary + schema introspection.
 */

import type { ServiceDeps } from '../deps.js';
import { toRegistryError } from '../errors.js';
import { runTool, mcpToolsList, type MCPToolContext, type MCPToolResult } from './registry.js';

export interface HandleRequestInput {
  tool: string;
  input?: Record<string, unknown>;
  agentId?: string;
  workspaceId?: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServer {
  /** Execute a tool call. Returns a structured MCPToolResult (never throws). */
  handleRequest(req: HandleRequestInput): Promise<MCPToolResult>;
  /** List all registered tools (for schema introspection). */
  listTools(): ToolDescriptor[];
}

/**
 * Create an MCP server bound to the given deps.
 */
export function createMcpServer(deps: ServiceDeps): McpServer {
  return {
    async handleRequest(req: HandleRequestInput): Promise<MCPToolResult> {
      try {
        if (!req.tool) {
          return { ok: false, error: { code: 'ERR_VALIDATION', message: 'Missing tool name' } };
        }
        if (!req.agentId) {
          return { ok: false, error: { code: 'ERR_UNAUTHORIZED', message: 'Missing agentId' } };
        }
        const ctx: MCPToolContext = {
          agentId: req.agentId,
          workspaceId: req.workspaceId ?? '',
        };
        const input = req.input ?? {};
        return await runTool(deps, req.tool, input, ctx);
      } catch (e) {
        const err = toRegistryError(e);
        return { ok: false, error: { code: err.code, message: err.message } };
      }
    },
    listTools(): ToolDescriptor[] {
      return mcpToolsList.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
  };
}
