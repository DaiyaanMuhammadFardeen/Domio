/**
 * Capability identifiers an agent can claim on the MCP surface.
 * Used by the router to gate tool calls.
 */
export type Capability =
  | 'hotspots:read'
  | 'hotspots:write'
  | 'overlays:read'
  | 'overlays:write'
  | 'state-machines:read'
  | 'state-machines:write'
  | 'variables:read'
  | 'variables:write'
  | 'rules:read'
  | 'rules:write'
  | 'bindings:read'
  | 'bindings:write'
  | 'forms:read'
  | 'forms:write'
  | 'forms:submit'
  | 'calculators:read'
  | 'calculators:write'
  | 'calculators:compute'
  | 'device-frames:read'
  | 'device-frames:write'
  | 'quizzes:read'
  | 'quizzes:write'
  | 'quizzes:answer'
  | 'sequences:read'
  | 'sequences:write'
  | 'deep-links:read'
  | 'deep-links:write'
  | 'simulate'
  | 'deck-diff'
  | 'nl-patch'
  // Phase 11 — 3D, motion & rich media (claim-level gates per mcp-3d.yaml / mcp-embed.yaml)
  | 'manage_assets'
  | 'manage_scenes'
  | 'manage_policies'
  // Phase 11 — 3D tool surface
  | 'models:read'
  | 'models:write'
  | 'scenes:read'
  | 'scenes:write'
  | 'camera-keyframes:read'
  | 'camera-keyframes:write'
  | 'shaders:read'
  | 'shaders:write'
  | 'licenses:read'
  | 'licenses:write'
  | 'cad-jobs:read'
  | 'cad-jobs:write'
  | 'ar-sessions:read'
  | 'ar-sessions:write'
  // Phase 11 — media tool surface
  | 'video:read'
  | 'video:write'
  | 'audio:read'
  | 'audio:write'
  | 'lottie:read'
  | 'lottie:write'
  // Phase 11 — embed tool surface
  | 'embed-policies:read'
  | 'embed-policies:write'
  | 'sandbox-policies:read'
  | 'sandbox-policies:write'
  | 'sandbox:run'
  | 'latex:render'
  | 'map-styles:read'
  | 'map-styles:write';

/**
 * Source of an audit entry: either a human user or an agent.
 */
export type AuditSource = 'human' | 'agent';

export interface AuditEntry {
  readonly id: string;
  readonly agentId: string;
  readonly source?: AuditSource;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
}

export interface McpContext {
  readonly agentId: string;
  readonly tenantId: string;
  readonly workspaceId?: string;
  readonly traceId?: string;
}

export interface McpError {
  readonly code:
    | 'PERMISSION_DENIED'
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'RUNTIME_ERROR'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'ROLLBACK_FAILED';
  readonly message: string;
  readonly issues?: readonly string[];
}

export interface McpTool<I = unknown, O = unknown> {
  readonly name: string;
  readonly description: string;
  readonly capability: Capability;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly handler: (ctx: McpContext, input: I) => Promise<O>;
}
