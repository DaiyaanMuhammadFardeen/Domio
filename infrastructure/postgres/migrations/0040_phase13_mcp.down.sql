-- 0040_phase13_mcp.down.sql
-- Phase 13 M1: drop all MCP server tables in reverse dependency order.
-- FK order: tool_call_idempotency → mcp_tool_call → mcp_session.

BEGIN;

DROP TABLE IF EXISTS tool_call_idempotency CASCADE;
DROP TABLE IF EXISTS agent_audit_event CASCADE;
DROP TABLE IF EXISTS mcp_tool_call CASCADE;
DROP TABLE IF EXISTS mcp_tool_capability CASCADE;
DROP TABLE IF EXISTS mcp_capability_scope CASCADE;
DROP TABLE IF EXISTS mcp_session CASCADE;

COMMIT;