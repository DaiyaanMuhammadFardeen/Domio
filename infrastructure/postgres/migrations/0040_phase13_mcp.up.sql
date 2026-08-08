-- 0040_phase13_mcp.up.sql
-- Phase 13 M1: MCP server — session, tool call, hash-chained audit.
--
-- Tables:
--   mcp_session        — authenticated client session (bearer token, scopes).
--   mcp_tool_call      — one invocation of a tool by a session.
--   tool_call_idempotency — UNIQUE (session_id, idempotency_key) for safe retries.
--   mcp_capability_scope — named capability (e.g. "read:deck").
--   mcp_tool_capability — many-to-many tool ↔ required capability.
--   agent_audit_event  — hash-chained audit log (HMAC-SHA256, prev_hash linkage).
--
-- All tables follow the P12 universal audit quartet:
--   created_at, updated_at, created_by, updated_by, ai_run_id, agent_session_id.
--
-- Workspace isolation: workspace_id UUID NOT NULL with RLS policies,
-- matching the 0039_phase12_ai_copilot.up.sql pattern.

BEGIN;

-- ---------------------------------------------------------------------------
-- mcp_session — bearer-token-authenticated client session.
-- scopes: text[] of capability scope identifiers (e.g. {"read:deck"}).
-- revoked_at: NULL while active; non-NULL means the session was killed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_session (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    principal_id    uuid NOT NULL,
    token_hash      text NOT NULL UNIQUE,
    scopes          text[] NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_session_workspace_idx ON mcp_session (workspace_id);
CREATE INDEX IF NOT EXISTS mcp_session_principal_idx ON mcp_session (principal_id);
CREATE INDEX IF NOT EXISTS mcp_session_token_idx ON mcp_session (token_hash);

-- ---------------------------------------------------------------------------
-- mcp_tool_call — one invocation of a tool by a session.
-- tool_name: e.g. "lint_deck", "get_provenance", "semantic_search".
-- status:    "running", "succeeded", "failed", "cancelled".
-- request_envelope / response_envelope: full JSON-RPC 2.0 envelope bodies.
-- idempotency_key: caller-supplied; NULL for reads (M1).
-- agent_session_id: links to a higher-level agent loop session (NULL in M1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_tool_call (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       uuid NOT NULL,
    session_id         uuid NOT NULL REFERENCES mcp_session (id) ON DELETE CASCADE,
    tool_name          text NOT NULL,
    request_envelope   jsonb NOT NULL,
    response_envelope  jsonb,
    status             text NOT NULL
                       CHECK (status IN ('running','succeeded','failed','cancelled')),
    error              jsonb,
    started_at         timestamptz NOT NULL DEFAULT now(),
    finished_at        timestamptz,
    idempotency_key    text,
    agent_session_id   uuid,
    created_by         uuid,
    updated_by         uuid,
    ai_run_id          uuid,
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_tool_call_session_idx ON mcp_tool_call (session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS mcp_tool_call_tool_idx ON mcp_tool_call (tool_name);
CREATE INDEX IF NOT EXISTS mcp_tool_call_workspace_idx ON mcp_tool_call (workspace_id);

-- ---------------------------------------------------------------------------
-- tool_call_idempotency — UNIQUE (session_id, idempotency_key) constraint.
-- A duplicate retry resolves to the original call. We store the binding
-- separately so that the mcp_tool_call row itself can be updated (e.g.
-- finished_at, status) without violating uniqueness on the binding.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tool_call_idempotency (
    session_id        uuid NOT NULL REFERENCES mcp_session (id) ON DELETE CASCADE,
    idempotency_key   text NOT NULL,
    tool_call_id      uuid NOT NULL REFERENCES mcp_tool_call (id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS tool_call_idempotency_call_idx ON tool_call_idempotency (tool_call_id);

-- ---------------------------------------------------------------------------
-- mcp_capability_scope — named capability identifiers.
-- A capability is something like "read:deck" or "lint:deck". Scopes
-- are referenced by mcp_session.scopes and by mcp_tool_capability.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_capability_scope (
    name             text PRIMARY KEY,
    description      text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed the M1 read-only scopes.
INSERT INTO mcp_capability_scope (name, description) VALUES
    ('read:deck',   'Read deck content, slide layout, and metadata'),
    ('lint:deck',   'Run layout / content lint rules over a deck'),
    ('search:deck', 'Semantic search across deck text and slide content'),
    ('audit:read',  'Read the hash-chained agent audit log'),
    ('claim:read',  'Read claim provenance, evidence, and confidence scores'),
    ('a11y:run',    'Run accessibility audit over a deck')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- mcp_tool_capability — many-to-many: which capabilities a tool requires.
-- A session must have ALL scopes listed for a given tool to invoke it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_tool_capability (
    tool_name        text NOT NULL,
    capability_name  text NOT NULL REFERENCES mcp_capability_scope (name) ON DELETE CASCADE,
    PRIMARY KEY (tool_name, capability_name)
);

-- Seed the M1 tool → capability mapping (6 read-only tools).
INSERT INTO mcp_tool_capability (tool_name, capability_name) VALUES
    ('lint_deck',             'read:deck'),
    ('lint_deck',             'lint:deck'),
    ('get_provenance',        'audit:read'),
    ('semantic_search',       'search:deck'),
    ('semantic_search',       'read:deck'),
    ('get_claim_confidence',  'claim:read'),
    ('get_claim_confidence',  'read:deck'),
    ('accessibility_audit',   'a11y:run'),
    ('accessibility_audit',   'read:deck'),
    ('check_freshness',       'claim:read')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- agent_audit_event — append-only, hash-chained audit log.
-- hash: HMAC-SHA256 over canonical(payload || seq || prev_hash), hex-encoded.
-- prev_hash: the previous event's hash (genesis = SHA256("")).
-- kid: HMAC key id used to sign this event.
-- The chain is per (workspace_id, agent_session_id) — NULL agent_session_id
-- means the global chain.
-- seq: monotonic per chain. UNIQUE (workspace_id, agent_session_id, seq).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_audit_event (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    session_id        uuid REFERENCES mcp_session (id) ON DELETE SET NULL,
    tool_call_id      uuid REFERENCES mcp_tool_call (id) ON DELETE SET NULL,
    agent_session_id  uuid,
    seq               bigint NOT NULL,
    event_type        text NOT NULL,
    payload           jsonb NOT NULL,
    prev_hash         text NOT NULL,
    hash              text NOT NULL,
    kid               text NOT NULL,
    recorded_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, agent_session_id, seq),
    UNIQUE (workspace_id, agent_session_id, hash)
);

CREATE INDEX IF NOT EXISTS agent_audit_event_session_idx
    ON agent_audit_event (session_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS agent_audit_event_tool_call_idx
    ON agent_audit_event (tool_call_id);
CREATE INDEX IF NOT EXISTS agent_audit_event_workspace_recorded_idx
    ON agent_audit_event (workspace_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Row-level security. Same pattern as 0039: app.tenant_id per request, with
-- a privileged bypass. The four tables that carry a workspace_id get RLS;
-- mcp_capability_scope and mcp_tool_capability are global lookup tables
-- (no RLS), and tool_call_idempotency is reachable only through mcp_session
-- (which has RLS), so we leave it without a workspace_id column by design.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'mcp_session', 'mcp_tool_call', 'agent_audit_event'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND policyname = t || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                ) WITH CHECK (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                )',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

COMMIT;