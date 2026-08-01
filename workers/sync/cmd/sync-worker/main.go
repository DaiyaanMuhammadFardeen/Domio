// Command sync-worker is the Phase 04 CRDT sync worker.
//
// It consumes CRDT operations from NATS JetStream, materialises them into
// Postgres (crdt_logs + branch_heads), periodically snapshots deck state
// for bounded replay, and prunes old ops after a configurable retention
// period.
//
// Environment variables (overridable via flags):
//
//	NATS_URL          — NATS server URL            (default: nats://localhost:4222)
//	POSTGRES_URL      — PostgreSQL connection URL    (default: postgres://localhost:5432/domio)
//	WORKER_ID         — Unique worker identifier     (default: sync-0)
//	PORT              — HTTP health/metrics port     (default: 9090)
//	SNAPSHOT_EVERY    — Snapshot every N ops/deck    (default: 5000)
//	PRUNE_AFTER_DAYS  — Retain ops for N days        (default: 30)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
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
	"google.golang.org/protobuf/proto"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/domio/platform/workers/sync/internal/materialize"
	"github.com/domio/platform/workers/sync/internal/snapshot"
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
	natsURL := flag.String("nats-url", envOrDefault("NATS_URL", "nats://localhost:4222"), "NATS server URL")
	postgresURL := flag.String("postgres-url", envOrDefault("POSTGRES_URL", "postgres://localhost:5432/domio?sslmode=disable"), "PostgreSQL connection URL")
	workerID := flag.String("worker-id", envOrDefault("WORKER_ID", "sync-0"), "Worker identifier")
	port := flag.Int("port", envOrDefaultInt("PORT", 9090), "HTTP health/metrics port")
	snapshotEvery := flag.Int64("snapshot-every", envOrDefaultInt64("SNAPSHOT_EVERY", 5000), "Snapshot every N ops per deck")
	pruneAfterDays := flag.Int("prune-after-days", envOrDefaultInt("PRUNE_AFTER_DAYS", 30), "Delete ops older than N days")
	batchSize := flag.Int("batch-size", envOrDefaultInt("BATCH_SIZE", 100), "Max ops per flush batch")
	flushMs := flag.Int("flush-ms", envOrDefaultInt("FLUSH_MS", 100), "Max ms between flushes")
	otelEndpoint := flag.String("otel-endpoint", envOrDefault("OTEL_ENDPOINT", ""), "OTLP gRPC endpoint (empty = noop)")
	flag.Parse()

	// ── Logger ───────────────────────────────────────────────────────
	logger := newLogger()
	defer logger.Sync() //nolint:errcheck

	logger.Info("sync-worker starting",
		zap.String("version", version),
		zap.String("commit", commit),
		zap.String("worker_id", *workerID),
		zap.Int("pid", os.Getpid()),
		zap.Int("gomaxprocs", runtime.GOMAXPROCS(0)),
	)

	// ── Context with graceful shutdown ───────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// ── OTel tracing ─────────────────────────────────────────────────
	shutdownTracer, err := initTracer(ctx, "sync-worker", *otelEndpoint)
	if err != nil {
		logger.Fatal("otel init failed", zap.Error(err))
	}
	defer shutdownTracer(ctx) //nolint:errcheck

	// ── Postgres ─────────────────────────────────────────────────────
	pool, err := pgxpool.New(ctx, *postgresURL)
	if err != nil {
		logger.Fatal("pgxpool.New failed", zap.Error(err))
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Fatal("pgx pool ping failed", zap.Error(err))
	}
	logger.Info("postgres connected", zap.String("url", redactURL(*postgresURL)))

	// ── NATS + JetStream ─────────────────────────────────────────────
	nc, err := nats.Connect(*natsURL,
		nats.Name(fmt.Sprintf("sync-worker-%s", *workerID)),
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

	// Ensure the "realtime" stream exists.
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "realtime",
		Subjects:  []string{"realtime.deck.*.crdt", "realtime.deck.*.presence", "realtime.deck.*.meta"},
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

	// Create a durable consumer for this worker.
	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       fmt.Sprintf("sync-worker-%s", *workerID),
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    5,
		AckWait:       30 * time.Second,
		FilterSubject: "realtime.deck.*.crdt",
	})
	if err != nil {
		logger.Fatal("consumer create failed", zap.Error(err))
	}

	// ── Snapshot store ───────────────────────────────────────────────
	snapStore := snapshot.NewPGXSnapshotStore(pool)
	snapMgr := snapshot.NewManager(snapStore, logger, *snapshotEvery)

	// ── Materializer ─────────────────────────────────────────────────
	matStore := materialize.NewPGXStore(pool)
	mat := materialize.New(matStore, logger,
		materialize.WithBatchSize(*batchSize),
		materialize.WithFlushInterval(time.Duration(*flushMs)*time.Millisecond),
		materialize.WithFlushCallback(func(ops []materialize.OpRecord) {
			infos := make([]snapshot.OpInfo, len(ops))
			for i, op := range ops {
				infos[i] = snapshot.OpInfo{
					OpID:   op.OpID,
					DeckID: op.DeckID,
					OpType: op.OpType,
				}
			}
			snapMgr.OnOpsFlushed(infos)
		}),
	)

	// ── Pruner (periodic op log cleanup) ─────────────────────────────
	go runPruner(ctx, pool, logger, *pruneAfterDays)

	// ── NATS consumer loop (Consume callback → ConsumeContext) ───────
	cc, err := consumer.Consume(func(msg jetstream.Msg) {
		processMsg(msg, mat, logger)
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
		fmt.Fprintf(w, `{"status":"ok","worker_id":"%s"}`, *workerID)
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
		fmt.Fprintf(w, `{"ready":true,"worker_id":"%s"}`, *workerID)
	})

	mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		metrics := map[string]any{
			"worker_id":      *workerID,
			"version":        version,
			"commit":         commit,
			"uptime_seconds": int64(time.Since(startTime).Seconds()),
			"goroutines":     runtime.NumGoroutine(),
			"buffer_len":     mat.BufferLen(),
			"gomaxprocs":     runtime.GOMAXPROCS(0),
		}
		json.NewEncoder(w).Encode(metrics) //nolint:errcheck
	})

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", *port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("http server listening", zap.Int("port", *port))
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

	// 2. Drain the materializer (flush remaining ops).
	mat.Stop()

	// 3. Shutdown HTTP server.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("http shutdown error", zap.Error(err))
	}

	// 4. Drain NATS.
	if err := nc.Drain(); err != nil {
		logger.Warn("nats drain error", zap.Error(err))
	}

	// 5. Close Postgres pool.
	pool.Close()

	logger.Info("sync-worker stopped")
}

// ---------------------------------------------------------------------------
// Message processing — deserialise NATS messages into OpRecords.
// ---------------------------------------------------------------------------

func processMsg(msg jetstream.Msg, mat *materialize.Materializer, logger *zap.Logger) {
	var op rt.Op
	if err := proto.Unmarshal(msg.Data(), &op); err != nil {
		logger.Warn("failed to unmarshal op", zap.Error(err))
		_ = msg.Nak()
		return
	}

	// Validate required fields.
	if op.GetOpId() == "" || op.GetDeckId() == "" {
		logger.Warn("op missing required fields",
			zap.String("op_id", op.GetOpId()),
			zap.String("deck_id", op.GetDeckId()))
		_ = msg.Nak()
		return
	}

	branchID := op.GetBranchId()
	if branchID == "" {
		branchID = "main"
	}

	// Map proto OpType to text.
	opType := opTypeToText(op.GetOpType())

	// Build the OpRecord.
	record := materialize.OpRecord{
		OpID:        op.GetOpId(),
		DeckID:      op.GetDeckId(),
		BranchID:    branchID,
		SlideID:     op.GetSlideId(),
		AuthorID:    op.GetAuthorId(),
		HLCPhysical: op.GetHlc().GetPhysical(),
		HLCLogical:  op.GetHlc().GetLogical(),
		OpType:      opType,
		Payload:     op.GetPayload(),
		Metadata:    map[string]any{"client_clock": op.GetClientClock()},
	}

	if ph := op.GetParentHlc(); ph != nil {
		p := ph.GetPhysical()
		l := ph.GetLogical()
		record.ParentHLCPhysical = &p
		record.ParentHLCLogical = &l
	}

	mat.Push(record)

	if err := msg.Ack(); err != nil {
		logger.Warn("msg ack failed", zap.String("op_id", op.GetOpId()), zap.Error(err))
	}
}

// ---------------------------------------------------------------------------
// Pruner — periodic op log cleanup.
// ---------------------------------------------------------------------------

func runPruner(ctx context.Context, pool *pgxpool.Pool, logger *zap.Logger, afterDays int) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	logger.Info("pruner started",
		zap.Int("retention_days", afterDays),
		zap.Duration("interval", 1*time.Hour),
	)

	// Run an initial prune on startup.
	pruneOnce(ctx, pool, logger, afterDays)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pruneOnce(ctx, pool, logger, afterDays)
		}
	}
}

func pruneOnce(ctx context.Context, pool *pgxpool.Pool, logger *zap.Logger, afterDays int) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cutoff := fmt.Sprintf("%d days", afterDays)

	// Delete old ops, preserving snapshots and ops after the latest
	// snapshot per deck.
	//
	// Strategy:
	//   1. For each op, LEFT JOIN LATERAL to find the latest snapshot
	//      for its deck.
	//   2. Delete the op if ALL of these are true:
	//      a. applied_at is older than the retention cutoff.
	//      b. It is NOT a snapshot row itself.
	//      c. Either no snapshot exists for the deck (fresh deck, safe to
	//         prune), OR the op's HLC is at or before the latest snapshot.
	result, err := pool.Exec(ctx,
		`DELETE FROM crdt_logs
		 WHERE op_id IN (
		   SELECT cl.op_id
		   FROM crdt_logs cl
		   LEFT JOIN LATERAL (
		     SELECT hlc_physical, hlc_logical
		     FROM crdt_logs snap
		     WHERE snap.deck_id = cl.deck_id AND snap.op_type = 'snapshot'
		     ORDER BY snap.hlc_physical DESC, snap.hlc_logical DESC
		     LIMIT 1
		   ) latest ON true
		   WHERE cl.applied_at < now() - $1::interval
		     AND cl.op_type != 'snapshot'
		     AND (
		       latest IS NULL
		       OR cl.hlc_physical < latest.hlc_physical
		       OR (cl.hlc_physical = latest.hlc_physical
		           AND cl.hlc_logical <= latest.hlc_logical)
		     )
		 )`,
		cutoff,
	)
	if err != nil {
		logger.Error("prune query failed", zap.Error(err))
		return
	}

	n := result.RowsAffected()
	if n > 0 {
		logger.Info("pruned old ops",
			zap.Int64("rows_deleted", n),
			zap.Int("retention_days", afterDays),
		)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func envOrDefault(key, def string) string {
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

func envOrDefaultInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
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

func opTypeToText(t rt.OpType) string {
	switch t {
	case rt.OpType_OP_TYPE_YJS_UPDATE:
		return "yjs_update"
	case rt.OpType_OP_TYPE_CHECKPOINT:
		return "checkpoint"
	default:
		return "unspecified"
	}
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
