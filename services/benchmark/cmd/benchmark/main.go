// Package main is the entrypoint for the benchmark service.
//
// Wires up:
//   * zap logger
//   * in-memory store pre-seeded with 4 fixtures (the production
//     ClickHouse + Postgres mirror is layered via the
//     store/clickhouse.go and store/postgres.go modules)
//   * chi-based HTTP server on port 8095 with /healthz, /readyz, and
//     /v1/benchmarks
//
// The HTTP routes are defined in services/benchmark/internal/httpapi.
//
// Environment variables (all optional):
//
//   PORT                  — listen port (default 8095)
//   CLICKHOUSE_URL        — e.g. http://localhost:8123
//   CLICKHOUSE_USER       — default "default"
//   CLICKHOUSE_PASSWORD   — empty by default
//   CLICKHOUSE_DB         — default "domio_analytics"
//   BENCHMARK_INGEST_KEY  — HMAC-SHA256 key for the ingest endpoint
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/benchmark/internal/hmac"
	"github.com/domio/platform/services/benchmark/internal/httpapi"
	"github.com/domio/platform/services/benchmark/internal/registry"
	"github.com/domio/platform/services/benchmark/internal/store"
)

func main() {
	port := getEnv("PORT", "8095")
	clickhouseURL := getEnv("CLICKHOUSE_URL", "")
	clickhouseDB := getEnv("CLICKHOUSE_DB", "domio_analytics")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "default")
	clickhousePassword := getEnv("CLICKHOUSE_PASSWORD", "")
	ingestKey := getEnv("BENCHMARK_INGEST_KEY", "")

	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Fprintf(os.Stderr, "logger init failed: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("benchmark: starting", zap.String("port", port))

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	// HMAC signing key (read once at startup).
	hmac.SetSigningKey(ingestKey)
	if ingestKey != "" {
		logger.Info("benchmark: HMAC ingest key set")
	} else {
		logger.Warn("benchmark: BENCHMARK_INGEST_KEY not set; ingest endpoint will reject all requests")
	}

	// Layered persistence: in-memory (always) + ClickHouse sink (if URL provided).
	mem := store.NewSeededInMemoryStore()
	svc := registry.New(mem)

	var chs *store.ClickHouseSnapshotWriter
	if clickhouseURL != "" {
		chs = store.NewClickHouseSnapshotWriter(clickhouseURL, clickhouseDB, clickhouseUser, clickhousePassword)
		logger.Info("benchmark: clickhouse sink configured", zap.String("url", clickhouseURL))
	}
	_ = chs // wired in commit 3 once the table exists

	// chi-based HTTP server.
	api := &httpapi.Server{Registry: svc, Store: mem}
	srv := &http.Server{
		Addr:              net.JoinHostPort("0.0.0.0", port),
		Handler:           api.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("benchmark: listening", zap.String("addr", srv.Addr))
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		logger.Info("benchmark: shutting down", zap.String("signal", sig.String()))
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("benchmark: server error", zap.Error(err))
		}
	}
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("benchmark: shutdown error", zap.Error(err))
	}
	logger.Info("benchmark: stopped")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
