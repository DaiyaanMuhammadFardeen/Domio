/**
 * @domio/mcp — Capability-claim gating for MCP tools.
 *
 * Phase 11 — W5. Public surface:
 *  - {@link assertCapability} — pure gate decision
 *  - {@link gatedHandler} — wrap a tool's handler with the gate
 *  - {@link createGatedMcpRegistry} — in-memory registry with enforcement
 *  - {@link GateDecision}, {@link GatedMcpRegistry}
 */

export * from './types.js';