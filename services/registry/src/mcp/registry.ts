/**
 * MCP Tool Registry — the full array, a lookup helper, and a dispatcher.
 */

import type { ServiceDeps } from '../deps.js';
import { mcpTools, type MCPTool, type MCPToolContext, type MCPToolResult } from './tools.js';

export type { MCPTool, MCPToolContext, MCPToolResult } from './tools.js';

/** The complete list of MCP tools. */
export const mcpToolsList: MCPTool[] = mcpTools;

/** Find a tool by name.  Returns undefined when not found. */
export function findTool(name: string): MCPTool | undefined {
  return mcpToolsList.find((t) => t.name === name);
}

/**
 * Dispatch a tool call by name.  Returns an error result (never throws)
 * when the tool is unknown.
 */
export async function runTool(
  deps: ServiceDeps,
  name: string,
  input: Record<string, unknown>,
  ctx: MCPToolContext,
): Promise<MCPToolResult> {
  const tool = findTool(name);
  if (!tool) {
    return { ok: false, error: { code: 'ERR_NOT_FOUND', message: `Unknown tool "${name}"` } };
  }
  return tool.run(deps, input, ctx);
}
