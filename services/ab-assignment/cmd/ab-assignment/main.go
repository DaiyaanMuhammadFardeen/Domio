// Package main is the entrypoint for the ab-assignment service.
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

	"github.com/domio/platform/services/ab-assignment/internal/assigner"
	"github.com/domio/platform/services/ab-assignment/internal/graphql"
	"github.com/domio/platform/services/ab-assignment/internal/httpapi"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

func main() {
	port := getEnv("PORT", "8080")
	postgresURL := getEnv("DATABASE_URL", getEnv("POSTGRES_URL", ""))
	clickhouseURL := getEnv("CLICKHOUSE_URL", "")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "default")
	clickhousePassword := getEnv("CLICKHOUSE_PASSWORD", "")
	clickhouseDB := getEnv("CLICKHOUSE_DB", "domio_analytics")

	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("ab-assignment: starting", zap.String("port", port))

	var st store.Store = store.NewInMemoryStore()
	if postgresURL != "" {
		// Production wiring uses Postgres; the Postgres-backed store
		// is implemented in internal/store/postgres.go (build-tag
		// guarded) and replaces this stub at deploy time.
		logger.Warn("DATABASE_URL set but postgres store not linked in this build; using in-memory")
	}

	sink := store.NewClickHouseExposureWriter(clickhouseURL, clickhouseDB, clickhouseUser, clickhousePassword)
	a := assigner.New(st, sink)
	sc := graphql.New(st)

	srv := &http.Server{
		Addr:              net.JoinHostPort("0.0.0.0", port),
		Handler:           (&httpapi.Server{Assigner: a, Store: st, GraphQL: sc}).Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("ab-assignment: listening", zap.String("addr", srv.Addr))
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		logger.Info("ab-assignment: shutting down", zap.String("signal", sig.String()))
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("ab-assignment: server error", zap.Error(err))
		}
	}
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("ab-assignment: shutdown error", zap.Error(err))
	}
	logger.Info("ab-assignment: stopped")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

var _ = context.Canceled