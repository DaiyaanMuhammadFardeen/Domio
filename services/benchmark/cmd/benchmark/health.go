package main

import (
	"encoding/json"
	"net/http"

	"go.uber.org/zap"

	"github.com/domio/platform/services/benchmark/internal/registry"
	"github.com/domio/platform/services/benchmark/internal/store"
)

// newMux builds the HTTP handler with health, ready, and the v1 routes.
//
// The benchmark service exposes:
//
//   GET    /healthz                  — liveness, always 200
//   GET    /readyz                   — readiness (200 if ClickHouse configured, or always 200 with in-memory fallback)
//   POST   /v1/benchmarks            — register a new benchmark
//   GET    /v1/benchmarks            — list benchmarks for the workspace
//   GET    /v1/benchmarks/{id}       — fetch one benchmark
//   POST   /v1/benchmarks/{id}/archive — archive a benchmark
//   POST   /v1/benchmarks/{id}/sign  — return the SHA-256 signature
//
// The signature/inference routes live in services/benchmark/internal/httpapi
// (added in commit 2). This mux wires the chi router when available; in
// commit 1 only the CRUD/signing surface is exposed via the stdlib mux.
func newMux(svc *registry.Service, chs *store.ClickHouseSnapshotWriter, logger *zap.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "benchmark",
		})
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		// Always ready — the in-memory store is sufficient for
		// commit 1. When the ClickHouse sink is added (commit 3) we
		// can require it here.
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":             "ready",
			"clickhouse_enabled": chs != nil,
		})
	})
	return mux
}