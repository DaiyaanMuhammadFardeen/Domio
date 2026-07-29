#!/bin/sh
# init-postgres.sh — runs on first Postgres boot inside the container.
# Creates the extensions and roles we need for Phase 0.

set -e

# Required extensions.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "vector";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    CREATE EXTENSION IF NOT EXISTS "citext";
EOSQL

echo "Domio Postgres initialized: extensions uuid-ossp, pgcrypto, pgvector, pg_trgm, citext."
