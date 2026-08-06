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
	"github.com/domio/platform/services/ai-orchestrator/internal/copy"
	"github.com/domio/platform/services/ai-orchestrator/internal/designer"
	"github.com/domio/platform/services/ai-orchestrator/internal/executor"
	"github.com/domio/platform/services/ai-orchestrator/internal/image"
	"github.com/domio/platform/services/ai-orchestrator/internal/observability"
	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
	"github.com/domio/platform/services/ai-orchestrator/internal/redesign"
	"github.com/domio/platform/services/ai-orchestrator/internal/renderer"
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
	var pool *pgxpool.Pool
	databaseURL := cfg.DatabaseURL

	if databaseURL != "" {
		p, poolErr := pgxpool.New(ctx, databaseURL)
		if poolErr != nil {
			logger.Fatal("pgxpool connect failed", zap.Error(poolErr))
		}
		if pingErr := p.Ping(ctx); pingErr != nil {
			logger.Fatal("pgxpool ping failed", zap.Error(pingErr))
		}
		defer p.Close()
		pool = p
		jobStore = store.NewPGXStore(pool)
		logger.Info("database connected", zap.String("dsn", maskDSN(databaseURL)))
	} else {
		logger.Warn("no DATABASE_URL — using in-memory store (dev/test only)")
		jobStore = store.NewMemStore()
	}

	// ─── Deck renderer (deck_versions / slides persistence) ──────────
	//
	// When DATABASE_URL is configured we persist deck_versions and slides
	// to Postgres; otherwise we fall back to the in-memory store. This
	// closes gap #2 from the Phase 12 status report (renderer was
	// previously write-only-in-memory).
	var deckStore renderer.DeckStore
	if pool != nil {
		deckStore = renderer.NewPGXDeckStore(pool)
	} else {
		deckStore = renderer.NewMemDeckStore()
	}
	deckRenderer := renderer.NewDeckRenderer(deckStore, nil)

	// ─── M2 features (#111–#114) ──────────────────────────────────────
	// Heuristic-only generators are used when no adapter is wired.
	// Production deployments replace these with the adapter gRPC
	// implementations (see internal/adapterclient).
	designerInstance := designer.New(heuristicGenerator{})
	redesignerInstance := redesign.New(&redesign.SpacingMutator{NormalizeColumns: true})
	copyAssistant := copy.New(nil)
	imageService := image.NewImageService(image.Config{
		Providers:       []image.Provider{},
		ReadyInFallback: "3 min",
	})

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
		Renderer:       deckRenderer,
		AdapterClient:  adapterClient,
		Designer:       designerInstance,
		Redesigner:     redesignerInstance,
		CopyAssistant:  copyAssistant,
		ImageService:   imageService,
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

// ─── Heuristic designer generator ───────────────────────────────────
//
// heuristicGenerator satisfies designer.OptionGenerator using
// deterministic templates. Production wiring replaces this with a
// generator backed by the adapter gRPC service.
type heuristicGenerator struct{}

func (heuristicGenerator) GenerateOptions(_ context.Context, prompt designer.SlidePrompt, target int) ([]designer.LayoutOption, error) {
	options := make([]designer.LayoutOption, 0, target)
	templates := []struct {
		id, hint, title string
		blocks           []string
		conf             float64
	}{
		{"tpl-title", "title-center", prompt.Intent, []string{prompt.Intent, "subtitle"}, 0.7},
		{"tpl-bullets", "bullets", prompt.Intent, []string{"key point 1", "key point 2", "key point 3"}, 0.7},
		{"tpl-2col", "2-col", prompt.Intent, []string{"left column", "right column"}, 0.6},
		{"tpl-3col", "3-col", prompt.Intent, []string{"col 1", "col 2", "col 3"}, 0.6},
		{"tpl-data-viz", "data-viz", prompt.Intent, []string{"chart"}, 0.5},
		{"tpl-image", "image", prompt.Intent, []string{"hero image"}, 0.5},
		{"tpl-table", "table", prompt.Intent, []string{"data table"}, 0.5},
		{"tpl-quote", "quote", prompt.Intent, []string{"pull quote"}, 0.5},
	}
	for i, tmpl := range templates {
		if i >= target {
			break
		}
		options = append(options, designer.LayoutOption{
			Index:         i + 1,
			TemplateID:    tmpl.id,
			Title:         tmpl.title,
			LayoutHint:    tmpl.hint,
			ContentBlocks: tmpl.blocks,
			Confidence:    tmpl.conf,
		})
	}
	return options, nil
}

func (heuristicGenerator) GenerateVariants(_ context.Context, seed designer.LayoutOption, _ designer.SlidePrompt, target int) ([]designer.LayoutOption, error) {
	options := make([]designer.LayoutOption, 0, target)
	hints := []string{"2-col", "3-col", "bullets", "content"}
	for i := 0; i < target; i++ {
		options = append(options, designer.LayoutOption{
			Index:         i + 1,
			TemplateID:    seed.TemplateID + "-v" + fmt.Sprintf("%d", i+1),
			Title:         seed.Title,
			LayoutHint:    hints[i%len(hints)],
			ContentBlocks: seed.ContentBlocks,
			Confidence:    0.6,
		})
	}
	return options, nil
}
