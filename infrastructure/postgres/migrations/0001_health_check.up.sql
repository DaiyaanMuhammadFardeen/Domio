-- Migration 0001: bootstrap health-check row + service registry.
-- Required extensions were installed by init-postgres.sh on the very first
-- container boot (not by this migration), so this file is idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS health_check (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name text NOT NULL,
    probe_at     timestamptz NOT NULL DEFAULT now(),
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (service_name, probe_at)
);

CREATE INDEX IF NOT EXISTS health_check_service_probe_idx
    ON health_check (service_name, probe_at DESC);

INSERT INTO health_check (service_name, payload)
VALUES
    ('api', jsonb_build_object('phase', 'phase-01')),
    ('realtime-gateway', jsonb_build_object('phase', 'phase-01')),
    ('editor', jsonb_build_object('phase', 'phase-01'))
ON CONFLICT DO NOTHING;

COMMIT;
