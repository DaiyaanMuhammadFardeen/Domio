# Phase 17 — ClickHouse migrator Makefile.
#
# Usage:
#   make migrate-up      # apply all pending migrations
#   make migrate-down    # revert a single migration (interactive — set ONE=0042)
#   make migrate-status  # show applied vs pending
#   make migrate-verify  # exit non-zero if drift detected

CLICKHOUSE_URL ?= http://localhost:8123
CLICKHOUSE_USER ?= domio
CLICKHOUSE_PASSWORD ?= domio
CLICKHOUSE_DB ?= domio_analytics
CLICKHOUSE_INIT_DIR ?= ../../clickhouse/init

.PHONY: migrate-up migrate-down migrate-status migrate-verify install

install:
	pnpm install

migrate-up:
	CLICKHOUSE_URL=$(CLICKHOUSE_URL) \
	CLICKHOUSE_USER=$(CLICKHOUSE_USER) \
	CLICKHOUSE_PASSWORD=$(CLICKHOUSE_PASSWORD) \
	CLICKHOUSE_DB=$(CLICKHOUSE_DB) \
	CLICKHOUSE_INIT_DIR=$(CLICKHOUSE_INIT_DIR) \
	pnpm run migrate:up

migrate-down:
	@if [ -z "$(ONE)" ]; then echo "set ONE=NNNN to revert a single migration"; exit 2; fi
	CLICKHOUSE_URL=$(CLICKHOUSE_URL) \
	CLICKHOUSE_USER=$(CLICKHOUSE_USER) \
	CLICKHOUSE_PASSWORD=$(CLICKHOUSE_PASSWORD) \
	CLICKHOUSE_DB=$(CLICKHOUSE_DB) \
	CLICKHOUSE_INIT_DIR=$(CLICKHOUSE_INIT_DIR) \
	pnpm run migrate:down -- --one=$(ONE)

migrate-status:
	CLICKHOUSE_URL=$(CLICKHOUSE_URL) \
	CLICKHOUSE_USER=$(CLICKHOUSE_USER) \
	CLICKHOUSE_PASSWORD=$(CLICKHOUSE_PASSWORD) \
	CLICKHOUSE_DB=$(CLICKHOUSE_DB) \
	CLICKHOUSE_INIT_DIR=$(CLICKHOUSE_INIT_DIR) \
	pnpm run migrate:status

migrate-verify:
	CLICKHOUSE_URL=$(CLICKHOUSE_URL) \
	CLICKHOUSE_USER=$(CLICKHOUSE_USER) \
	CLICKHOUSE_PASSWORD=$(CLICKHOUSE_PASSWORD) \
	CLICKHOUSE_DB=$(CLICKHOUSE_DB) \
	CLICKHOUSE_INIT_DIR=$(CLICKHOUSE_INIT_DIR) \
	pnpm run migrate:verify
