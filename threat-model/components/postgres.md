unit: postgres
owner: data-platform@example.com
stride:
  S:
    score: 4
    notes:
      - Service accounts can only authenticate via Vault-issued short
        lived credentials; no static passwords are stored.
  T:
    score: 4
    notes:
      - All migrations go through `migration-lint` which enforces
        `BEGIN/COMMIT`, `IF EXISTS`, and forbids direct `DROP COLUMN`.
      - Audit triggers capture `updated_by` for every row.
  R:
    score: 6
    notes:
      - Hash-chained audit log table (`audit_log`) records every
        mutating statement with the actor and a `prev_hash` so
        truncation is detectable.
  I:
    score: 9
    notes:
      - TLS-only client connections, enforced by `pg_hba.conf`.
      - Row-level security policies enforce tenant scoping as a
        database-level guarantee, not just application-layer.
      - Backups are encrypted with a per-environment KMS key.
  D:
    score: 6
    notes:
      - Connection pool sized to `MAX_CONNECTIONS × 0.8` headroom.
      - Replication lag SLO 30s alerts before traffic is shifted.
  E:
    score: 4
    notes:
      - `pg_hba.conf` only allows services from the in-cluster CIDR.
