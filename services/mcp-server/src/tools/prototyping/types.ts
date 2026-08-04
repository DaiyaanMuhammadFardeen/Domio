/**
 * Shared MCP tool types + utilities for the prototyping surface.
 */
import type {
  AuditEntry,
  Capability,
  McpContext,
  McpError,
  McpTool,
} from '@domio/agent-schema';

export type { AuditEntry, Capability, McpContext, McpError, McpTool };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'INVALID_INPUT'; issues: string[] };

export class MCPError extends Error {
  readonly code: McpError['code'];
  readonly issues?: readonly string[];
  constructor(code: McpError['code'], message: string, issues?: readonly string[]) {
    super(`[${code}] ${message}`);
    this.name = 'MCPError';
    this.code = code;
    if (issues) this.issues = issues;
  }
}

export type AuditTrail = {
  append(entry: AuditEntry): void;
  list(filter?: { agentId?: string; toolName?: string; limit?: number }): readonly AuditEntry[];
  clear(): void;
};

export function createInMemoryAuditTrail(): AuditTrail {
  const entries: AuditEntry[] = [];
  return {
    append(entry) {
      entries.push(entry);
    },
    list(filter) {
      let arr = entries;
      if (filter?.agentId) arr = arr.filter((e) => e.agentId === filter.agentId);
      if (filter?.toolName) arr = arr.filter((e) => e.toolName === filter.toolName);
      const limit = filter?.limit ?? 100;
      return arr.slice(-limit).reverse();
    },
    clear() {
      entries.length = 0;
    },
  };
}

export const globalAuditTrail: AuditTrail = createInMemoryAuditTrail();

export const PROTOTYPE_RUNTIME_URL =
  process.env['PROTOTYPE_RUNTIME_URL'] ?? 'http://localhost:7700';

export type ToolRegistry = ReadonlyArray<McpTool<unknown, unknown>>;

export function validateString(input: unknown, field: string, issues: string[]): string | null {
  if (typeof input !== 'string') {
    issues.push(`${field} must be a string`);
    return null;
  }
  if (input.trim().length === 0) {
    issues.push(`${field} must be non-empty`);
    return null;
  }
  return input;
}

export function validateObject(input: unknown, field: string, issues: string[]): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    issues.push(`${field} must be an object`);
    return null;
  }
  return input as Record<string, unknown>;
}

export function validateNumber(input: unknown, field: string, issues: string[]): number | null {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    issues.push(`${field} must be a finite number`);
    return null;
  }
  return input;
}

export function validateEnum<T extends string>(
  input: unknown,
  field: string,
  allowed: readonly T[],
  issues: string[],
): T | null {
  if (typeof input !== 'string' || !allowed.includes(input as T)) {
    issues.push(`${field} must be one of ${allowed.join(', ')}`);
    return null;
  }
  return input as T;
}

export async function callPrototypeRuntime(
  ctx: McpContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${PROTOTYPE_RUNTIME_URL}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tenant-id': ctx.tenantId,
    'x-agent-id': ctx.agentId,
  };
  if (ctx.traceId) headers['x-trace-id'] = ctx.traceId;
  const init: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    const code: McpError['code'] =
      res.status === 404
        ? 'NOT_FOUND'
        : res.status === 408 || res.status === 504
          ? 'TIMEOUT'
          : 'RUNTIME_ERROR';
    throw new MCPError(code, `${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function withAuditTrail<T>(
  ctx: McpContext,
  toolName: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  return run()
    .then((output) => {
      globalAuditTrail.append({
        id: `${toolName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        agentId: ctx.agentId,
        source: 'agent',
        toolName,
        input,
        output: output as unknown,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
      });
      return output;
    })
    .catch((err) => {
      const errCode = err instanceof MCPError ? err.code : 'RUNTIME_ERROR';
      globalAuditTrail.append({
        id: `${toolName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        agentId: ctx.agentId,
        source: 'agent',
        toolName,
        input,
        output: null,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        errorCode: errCode,
      });
      throw err;
    });
}
