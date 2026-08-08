// Package main is the entrypoint for the crm-sync service.
//
// Wires up:
//   * zap logger + OTel tracer
//   * NATS JetStream DLQ publisher (subject "crm.dlq")
//   * ClickHouse HTTP writer for crm_sync_record rows
//   * The per-provider adapter registry (HubSpot, Salesforce, Intercom, Outreach)
//
// The actual NATS subscription loop that drives the orchestrator
// is intentionally not wired in this milestone — Phase 17 W7
// delivers the building blocks (registry, adapters, retry policy,
// idempotency, warehouse writer, DLQ) and the consumer is added
// in the next iteration once we settle the upstream trigger
// subject (`crm.sync.events`).
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/adapters"
	"github.com/domio/platform/services/crm-sync/internal/clickhouse"
	"github.com/domio/platform/services/crm-sync/internal/dlq"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

func main() {
	port := getEnv("PORT", "8080")
	natsURL := getEnv("NATS_URL", "nats://localhost:4222")
	chURL := getEnv("CLICKHOUSE_URL", "http://localhost:8123")
	chDB := getEnv("CLICKHOUSE_DB", "domio_analytics")
	chUser := getEnv("CLICKHOUSE_USER", "default")
	chPass := getEnv("CLICKHOUSE_PASS", "")

	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Fprintf(os.Stderr, "logger init failed: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("crm-sync: starting",
		zap.String("port", port),
		zap.String("nats_url", natsURL),
		zap.String("clickhouse_url", chURL))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Adapter registry.
	reg := registry.New()
	reg.Register("hubspot", func() registry.Adapter { return adapters.NewHubSpot(logger) })
	reg.Register("salesforce", func() registry.Adapter { return adapters.NewSalesforce(logger) })
	reg.Register("intercom", func() registry.Adapter { return adapters.NewIntercom(logger) })
	reg.Register("outreach", func() registry.Adapter { return adapters.NewOutreach(logger) })
	logger.Info("crm-sync: registered adapters", zap.Strings("providers", reg.Providers()))

	// DLQ publisher (NATS JetStream). The orchestrator is wired
	// to use this publisher directly once the NATS subscription
	// loop is added in the next iteration; for now we just
	// confirm we can connect.
	if natsURL != "" {
		natsPub, err := dlq.NewNatsPublisher(ctx, natsURL, logger)
		if err != nil {
			logger.Warn("crm-sync: NATS unavailable, running without DLQ", zap.Error(err))
		} else {
			defer natsPub.Close()
			logger.Info("crm-sync: NATS DLQ connected", zap.String("subject", dlq.Subject))
		}
	}

	// ClickHouse writer.
	var ch *clickhouse.Writer
	if chURL != "" {
		ch, err = clickhouse.NewWriter(clickhouse.Config{
			URL:    chURL,
			DB:     chDB,
			User:   chUser,
			Pass:   chPass,
			Logger: logger,
		})
		if err != nil {
			logger.Warn("crm-sync: ClickHouse unavailable", zap.Error(err))
		}
	}

	srv := startHealthServer(port, reg, ch)
	logger.Info("crm-sync: listening", zap.String("addr", srv.Addr))

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	select {
	case sig := <-sigCh:
		logger.Info("crm-sync: shutting down", zap.String("signal", sig.String()))
	case <-ctx.Done():
	}
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	logger.Info("crm-sync: stopped")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
