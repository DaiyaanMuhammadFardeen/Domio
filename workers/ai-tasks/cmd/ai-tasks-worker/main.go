// Command ai-tasks-worker is the Phase 12 AI task processing worker.
//
// It consumes AI job requests from NATS JetStream, marks them as running
// in Postgres (ai_job), delegates to a Handler for execution, and marks
// them as succeeded/failed before acking the message.
//
// Environment variables (overridable via flags):
//
//	NATS_URL                       — NATS server URL            (default: nats://localhost:4222)
//	DATABASE_URL                   — PostgreSQL connection URL  (default: postgres://localhost:5432/domio)
//	PORT                           — HTTP health/metrics port   (default: 8081)
//	OTEL_EXPORTER_OTLP_ENDPOINT    — OTLP gRPC endpoint         ("" = noop)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/domio/platform/workers/ai-tasks/internal/handler"
	"github.com/domio/platform/workers/ai-tasks/internal/store"
)

// ---------------------------------------------------------------------------
// Build-time injection (via -ldflags).
// ---------------------------------------------------------------------------

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

var startTime = time.Now()

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	// ── Flags / env ──────────────────────────────────────────────────
	natsURL := flagOrDefault("NATS_URL", "nats://localhost:4222")
	databaseURL := flagOrDefault("DATABASE_URL", "postgres://localhost:5432/domio?sslmode=disable")
	port := envOrDefaultInt("PORT", 8081)
	otelEndpoint := flagOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	// ── Logger ───────────────────────────────────────────────────────
	logger := newLogger()
	defer logger.Sync() //nolint:errcheck

	logger.Info("ai-tasks-worker starting",
		zap.String("version", version),
		zap.String("commit", commit),
		zap.Int("pid", os.Getpid()),
		zap.Int("gomaxprocs", runtime.GOMAXPROCS(0)),
	)

	// ── Context with graceful shutdown ───────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// ── OTel tracing ─────────────────────────────────────────────────
	shutdownTracer, err := initTracer(ctx, "ai-tasks-worker", otelEndpoint)
	if err != nil {
		logger.Fatal("otel init failed", zap.Error(err))
	}
	defer shutdownTracer(ctx) //nolint:errcheck

	// ── Postgres ─────────────────────────────────────────────────────
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		logger.Fatal("pgxpool.New failed", zap.Error(err))
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Fatal("pgx pool ping failed", zap.Error(err))
	}
	logger.Info("postgres connected", zap.String("url", redactURL(databaseURL)))

	// ── Store ────────────────────────────────────────────────────────
	pgStore := store.NewPGXStore(pool)

	// ── Handler ──────────────────────────────────────────────────────
	h := handler.NewStubHandler(pgStore, logger)

	// ── NATS + JetStream ─────────────────────────────────────────────
	nc, err := nats.Connect(natsURL,
		nats.Name("ai-tasks-worker"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			logger.Warn("nats disconnected", zap.Error(err))
		}),
		nats.ReconnectHandler(func(_ *nats.Conn) {
			logger.Info("nats reconnected")
		}),
	)
	if err != nil {
		logger.Fatal("nats.Connect failed", zap.Error(err))
	}
	defer nc.Drain() //nolint:errcheck

	js, err := jetstream.New(nc)
	if err != nil {
		logger.Fatal("jetstream.New failed", zap.Error(err))
	}

	// Ensure the "ai" stream exists.
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "ai",
		Subjects:  []string{"ai.jobs.*"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.WorkQueuePolicy,
		MaxAge:    7 * 24 * time.Hour, // 7 days
	})
	if err != nil {
		logger.Fatal("stream create/update failed", zap.Error(err))
	}
	si, err := stream.Info(ctx)
	if err != nil {
		logger.Fatal("stream.Info failed", zap.Error(err))
	}
	logger.Info("jetstream stream ready", zap.String("stream", si.Config.Name))

	// Create a durable consumer.
	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       "ai-tasks-worker",
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    5,
		AckWait:       30 * time.Second,
		FilterSubject: "ai.jobs.*",
	})
	if err != nil {
		logger.Fatal("consumer create failed", zap.Error(err))
	}

	// ── Metrics counter ──────────────────────────────────────────────
	var jobsHandled atomic.Int64

	// ── NATS consumer loop ──────────────────────────────────────────
	cc, err := consumer.Consume(func(msg jetstream.Msg) {
		processMsg(msg, h, logger, &jobsHandled)
	})
	if err != nil {
		logger.Fatal("consumer.Consume failed", zap.Error(err))
	}

	// ── HTTP server (healthz / readyz / metrics) ─────────────────────
	httpReady := make(chan struct{})
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !nc.IsConnected() {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"ready":false,"reason":"nats disconnected"}`)
			return
		}
		if err := pool.Ping(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintf(w, `{"ready":false,"reason":"postgres: %s"}`, err.Error())
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"ready":true}`)
	})

	mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		metrics := map[string]any{
			"version":        version,
			"commit":         commit,
			"uptime_seconds": int64(time.Since(startTime).Seconds()),
			"goroutines":     runtime.NumGoroutine(),
			"jobs_handled":   jobsHandled.Load(),
			"gomaxprocs":     runtime.GOMAXPROCS(0),
		}
		json.NewEncoder(w).Encode(metrics) //nolint:errcheck
	})

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("http server listening", zap.Int("port", port))
		close(httpReady)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server error", zap.Error(err))
		}
	}()

	// Wait for readiness.
	<-httpReady

	// ── Block until shutdown signal ──────────────────────────────────
	sig := <-sigCh
	logger.Info("shutdown signal received", zap.String("signal", sig.String()))

	// ── Graceful shutdown sequence ───────────────────────────────────
	cancel() // signal all goroutines

	// 1. Stop accepting new NATS messages.
	if cc != nil {
		cc.Stop()
	}

	// 2. Shutdown HTTP server.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("http shutdown error", zap.Error(err))
	}

	// 3. Drain NATS.
	if err := nc.Drain(); err != nil {
		logger.Warn("nats drain error", zap.Error(err))
	}

	// 4. Close Postgres pool.
	pool.Close()

	logger.Info("ai-tasks-worker stopped")
}

// ---------------------------------------------------------------------------
// Message processing — extract job ID from NATS subject and dispatch.
// ---------------------------------------------------------------------------

// processMsg extracts the job ID from the NATS message subject
// (ai.jobs.<jobID>) and delegates to the handler.
func processMsg(msg jetstream.Msg, h handler.Handler, logger *zap.Logger, counter *atomic.Int64) {
	subject := msg.Subject()
	jobID := extractJobID(subject)
	if jobID == "" {
		logger.Warn("invalid subject: cannot extract job ID",
			zap.String("subject", subject))
		_ = msg.Nak()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := h.Handle(ctx, jobID); err != nil {
		logger.Error("handler failed",
			zap.String("job_id", jobID),
			zap.Error(err))
		_ = msg.Nak()
		return
	}

	counter.Add(1)

	if err := msg.Ack(); err != nil {
		logger.Warn("msg ack failed",
			zap.String("job_id", jobID),
			zap.Error(err))
	}
}

// extractJobID parses the job ID from a NATS subject of the form
// "ai.jobs.<jobID>".
func extractJobID(subject string) string {
	const prefix = "ai.jobs."
	if len(subject) <= len(prefix) {
		return ""
	}
	if subject[:len(prefix)] != prefix {
		return ""
	}
	return subject[len(prefix):]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func flagOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envOrDefaultInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func redactURL(url string) string {
	for i, ch := range url {
		if ch == ':' && i+2 < len(url) && url[i+1] == '/' && url[i+2] == '/' {
			return url[:i+3] + "***"
		}
	}
	return "***"
}

// ---------------------------------------------------------------------------
// OTel tracer initialisation.
// ---------------------------------------------------------------------------

func initTracer(ctx context.Context, serviceName, endpoint string) (func(context.Context) error, error) {
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp exporter: %w", err)
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("resource merge: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	return tp.Shutdown, nil
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

func newLogger() *zap.Logger {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder
	l, err := cfg.Build(zap.AddCallerSkip(0))
	if err != nil {
		return zap.NewNop()
	}
	return l
}
