// Package main is the entrypoint for the AI orchestrator service.
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

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/domio/platform/services/ai-orchestrator/internal/adapterclient"
	"github.com/domio/platform/services/ai-orchestrator/internal/config"
	"github.com/domio/platform/services/ai-orchestrator/internal/executor"
	"github.com/domio/platform/services/ai-orchestrator/internal/observability"
	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
	"github.com/domio/platform/services/ai-orchestrator/internal/router"
	"github.com/domio/platform/services/ai-orchestrator/internal/secretbroker"
	"github.com/domio/platform/services/ai-orchestrator/internal/store"
)

func main() {
	// ─── Configuration from environment ───────────────────────────────
	cfg := config.Load()

	// ─── Logger ────────────────────────────────────────────────────────
	logger, err := observability.NewLogger()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("ai-orchestrator: starting",
		zap.String("port", cfg.Port),
		zap.String("default_provider", cfg.DefaultProvider))

	// ─── Tracing ──────────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	shutdownTracer, err := observability.InitTracer(ctx, "ai-orchestrator", cfg.OTLPEndpoint)
	if err != nil {
		logger.Fatal("otel init failed", zap.Error(err))
	}
	defer shutdownTracer(context.Background())

	// ─── Secret broker (env-backed) ──────────────────────────────────
	broker := selectBroker()
	_ = broker // available to executor/providers via broker.Get(ctx, key)

	// ─── Adapter client (gRPC seam, will be wired in P2-L1) ──────────
	adapterClient, err := adapterclient.NewGRPCClient("")
	if err != nil {
		logger.Warn("adapter client init failed (expected until P2-L1)", zap.Error(err))
	}
	_ = adapterClient

	// ─── Database store ───────────────────────────────────────────────
	var jobStore store.Store
	databaseURL := cfg.DatabaseURL

	if databaseURL != "" {
		pool, poolErr := pgxpool.New(ctx, databaseURL)
		if poolErr != nil {
			logger.Fatal("pgxpool connect failed", zap.Error(poolErr))
		}
		if pingErr := pool.Ping(ctx); pingErr != nil {
			logger.Fatal("pgxpool ping failed", zap.Error(pingErr))
		}
		defer pool.Close()
		jobStore = store.NewPGXStore(pool)
		logger.Info("database connected", zap.String("dsn", maskDSN(databaseURL)))
	} else {
		logger.Warn("no DATABASE_URL — using in-memory store (dev/test only)")
		jobStore = store.NewMemStore()
	}

	// ─── Planner ──────────────────────────────────────────────────────
	p := planner.New(cfg.MaxDecompositionDepth)

	// ─── Executor (provider chain with retries + circuit breaker) ─────
	providers := []executor.Provider{
		&placeholderProvider{name: cfg.DefaultProvider},
	}
	exec := executor.New(providers, 3, cfg.MaxCostPerReq, cfg.CircuitBreakerThreshold)

	// ─── Router ───────────────────────────────────────────────────────
	r := router.New(router.Config{
		Logger:         logger,
		Executor:       exec,
		Planner:        p,
		Store:          jobStore,
		ModerationGate: cfg.ModerationEnabled,
		MaxCostPerReq:  cfg.MaxCostPerReq,
	})

	// ─── HTTP server ──────────────────────────────────────────────────
	srv := &http.Server{
		Addr:              net.JoinHostPort("0.0.0.0", cfg.Port),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// ─── Graceful shutdown ────────────────────────────────────────────
	errCh := make(chan error, 1)
	go func() {
		logger.Info("ai-orchestrator: listening", zap.String("addr", srv.Addr))
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		logger.Info("ai-orchestrator: shutting down", zap.String("signal", sig.String()))
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("ai-orchestrator: server error", zap.Error(err))
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("ai-orchestrator: shutdown error", zap.Error(err))
	}

	logger.Info("ai-orchestrator: stopped")
}

// ─── Helpers ────────────────────────────────────────────────────────

// selectBroker picks the best available secret broker. Prefer EnvBroker
// if any AI keys are set; fall back to VaultBroker stub.
func selectBroker() secretbroker.Broker {
	if os.Getenv(secretbroker.KeyOpenAI) != "" ||
		os.Getenv(secretbroker.KeyAnthropic) != "" ||
		os.Getenv(secretbroker.KeyGoogleAI) != "" {
		return secretbroker.NewEnvBroker()
	}
	return secretbroker.NewVaultBroker()
}

// maskDSN hides the password from a Postgres DSN for safe logging.
func maskDSN(dsn string) string {
	// Simple heuristic: redact anything after "://" and before "@".
	for i := 0; i < len(dsn); i++ {
		if dsn[i] == ':' && i+3 < len(dsn) && dsn[i+1] == '/' && dsn[i+2] == '/' {
			start := i + 3
			for j := start; j < len(dsn); j++ {
				if dsn[j] == '@' {
					return dsn[:start] + "****" + dsn[j:]
				}
			}
			break
		}
	}
	return dsn
}

// ─── Placeholder provider ──────────────────────────────────────────

// placeholderProvider satisfies the executor.Provider interface. It will be
// replaced with the typed adapter client once the gRPC stubs land in CI.
type placeholderProvider struct {
	name string
}

func (p *placeholderProvider) Name() string { return p.name }

func (p *placeholderProvider) Complete(_ context.Context, prompt string) (string, int, float64, error) {
	tokens := len(prompt) / 4
	if tokens == 0 {
		tokens = 1
	}
	cost := float64(tokens) * 0.00002
	return "Placeholder response for: " + prompt, tokens, cost, nil
}
