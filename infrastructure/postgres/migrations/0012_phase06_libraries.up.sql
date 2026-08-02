-- Migration 0012: Phase 06 — user + team libraries and the append-only sync log.
--
-- user_library records an install (pin mode per instance resolution);
-- team_library carries the workspace sync policy; team_library_event is the
-- per-namespace append-only log keyed by (library_id, seq) for idempotent
-- offline replay.

BEGIN;

CREATE TABLE IF NOT EXISTS user_library (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    workspace_id    text NOT NULL,
    catalog_id      text NOT NULL,
    installed_version text NOT NULL,
    pin_mode        text NOT NULL DEFAULT 'track-latest'
                    CHECK (pin_mode IN ('track-latest', 'pin-version', 'pin-range', 'workspace-managed')),
    pin_value       text,
    license_grant_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, workspace_id, catalog_id)
);

CREATE INDEX IF NOT EXISTS user_library_workspace_idx
    ON user_library (workspace_id, catalog_id);

CREATE TABLE IF NOT EXISTS team_library (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    text NOT NULL,
    name            text NOT NULL,
    policy_mode     text NOT NULL DEFAULT 'latest'
                    CHECK (policy_mode IN ('latest', 'patch', 'minor', 'pinned')),
    owner_id        text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS team_library_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id      uuid NOT NULL REFERENCES team_library (id) ON DELETE CASCADE,
    seq             bigint NOT NULL,
    kind            text NOT NULL
                    CHECK (kind IN ('component_published', 'component_updated',
                                    'component_removed', 'policy_changed')),
    component_id    text NOT NULL,
    version         text,
    payload_ref     text,
    actor_id        text NOT NULL,
    actor_kind      text NOT NULL DEFAULT 'human'
                    CHECK (actor_kind IN ('human', 'agent')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (library_id, seq)
);

ALTER TABLE user_library       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_library       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_library_event ENABLE ROW LEVEL SECURITY;

COMMIT;
