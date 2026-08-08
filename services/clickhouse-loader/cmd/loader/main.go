// Package main is the entrypoint for the clickhouse-loader service.
//
// The loader is the W2 bridge between the Kafka analytics ingest topic
// and the ClickHouse columnar warehouse. It reads batches from Kafka,
// parses each event envelope, and INSERTs them into the `events` table
// defined in infrastructure/clickhouse/init/001_phase17_schema.sql.
//
// The loader batches up to 5k rows or 1 second of wall-clock time before
// flushing. It commits offsets to Kafka only after a successful
// ClickHouse INSERT, so an INSERT failure forces a re-read.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"

	"github.com/domio/platform/services/clickhouse-loader/internal/clickhouse"
	"github.com/domio/platform/services/clickhouse-loader/internal/config"
	"github.com/domio/platform/services/clickhouse-loader/internal/kafkacons"
	"github.com/domio/platform/services/clickhouse-loader/internal/metrics"
	"github.com/domio/platform/services/clickhouse-loader/internal/model"
	"github.com/domio/platform/services/clickhouse-loader/internal/observability"
)

// envOr returns the value of the env var or a default.
func envOr(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// envIntOr returns the int value of the env var or a default.
func envIntOr(key string, def int) int {
	v := envOr(key, "")
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func main() {
	// ─── Configuration ────────────────────────────────────────────────
	cfg := config.LoaderConfig{
		KafkaBrokers:   envOr("KAFKA_BROKERS", "localhost:9092"),
		KafkaTopic:     envOr("KAFKA_TOPIC", "events.ingest.raw"),
		KafkaGroupID:   envOr("KAFKA_GROUP_ID", "clickhouse-loader"),
		KafkaDLQTopic:  envOr("KAFKA_DLQ_TOPIC", "events.ingest.dlq"),
		ClickHouseAddr: envOr("CLICKHOUSE_ADDR", "localhost:9000"),
		ClickHouseDB:   envOr("CLICKHOUSE_DB", "domio_analytics"),
		ClickHouseUser: envOr("CLICKHOUSE_USER", "default"),
		ClickHousePass: envOr("CLICKHOUSE_PASSWORD", ""),
		HealthPort:     envOr("HEALTH_PORT", "8080"),
		BatchMaxRows:   envIntOr("BATCH_MAX_ROWS", 5000),
		BatchMaxMS:     envIntOr("BATCH_MAX_MS", 1000),
		Concurrency:    envIntOr("CONCURRENCY", 4),
	}

	// ─── Logger ───────────────────────────────────────────────────────
	logger, err := observability.NewLogger()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = logger.Sync() }()

	logger.Info("clickhouse-loader: starting",
		zap.String("topic", cfg.KafkaTopic),
		zap.String("group_id", cfg.KafkaGroupID),
		zap.String("clickhouse_addr", cfg.ClickHouseAddr),
		zap.Int("batch_max_rows", cfg.BatchMaxRows),
		zap.Int("concurrency", cfg.Concurrency))

	// ─── Metrics ──────────────────────────────────────────────────────
	m := metrics.New()

	// ─── ClickHouse writer ────────────────────────────────────────────
	ch, err := clickhouse.NewWriter(clickhouse.Config{
		Addr:    cfg.ClickHouseAddr,
		DB:      cfg.ClickHouseDB,
		User:    cfg.ClickHouseUser,
		Pass:    cfg.ClickHousePass,
		Logger:  logger,
		Metrics: m,
	})
	if err != nil {
		logger.Fatal("clickhouse connect", zap.Error(err))
	}
	defer func() { _ = ch.Close() }()

	// ─── Kafka consumer ───────────────────────────────────────────────
	cons, err := kafkacons.New(kafkacons.Config{
		Brokers:    cfg.KafkaBrokers,
		Topic:      cfg.KafkaTopic,
		GroupID:    cfg.KafkaGroupID,
		DLQTopic:   cfg.KafkaDLQTopic,
		Logger:     logger,
		Metrics:    m,
		Concurrency: cfg.Concurrency,
	})
	if err != nil {
		logger.Fatal("kafka consumer init", zap.Error(err))
	}
	defer func() { _ = cons.Close() }()

	// ─── Health server ────────────────────────────────────────────────
	var ready atomic.Bool
	ready.Store(false)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		if ready.Load() {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ready"))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("starting"))
	})
	mux.Handle("/metrics", m.Handler())
	healthSrv := &http.Server{
		Addr:              ":" + cfg.HealthPort,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := healthSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("health server", zap.Error(err))
		}
	}()

	// ─── Context with signal handling ─────────────────────────────────
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// ─── Run ──────────────────────────────────────────────────────────
	ready.Store(true)
	logger.Info("clickhouse-loader: ready")

	runErr := run(ctx, cfg, cons, ch, logger, m)

	// ─── Shutdown ─────────────────────────────────────────────────────
	logger.Info("clickhouse-loader: shutting down")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := healthSrv.Shutdown(shutdownCtx); err != nil {
		logger.Error("health shutdown", zap.Error(err))
	}
	if runErr != nil && !errors.Is(runErr, context.Canceled) {
		logger.Error("clickhouse-loader: exiting with error", zap.Error(runErr))
		os.Exit(1)
	}
}

// run loops until ctx is cancelled, dispatching consumed Kafka messages
// to the ClickHouse writer in batches.
func run(
	ctx context.Context,
	cfg config.LoaderConfig,
	cons *kafkacons.Consumer,
	ch *clickhouse.Writer,
	logger *zap.Logger,
	m *metrics.Metrics,
) error {
	flushTimer := time.NewTicker(time.Duration(cfg.BatchMaxMS) * time.Millisecond)
	defer flushTimer.Stop()

	pending := make([]model.IngestRecord, 0, cfg.BatchMaxRows)
	pendingMeta := make([]kafka.Message, 0, cfg.BatchMaxRows)

	flush := func(reason string) {
		if len(pending) == 0 {
			return
		}
		insertCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := ch.Insert(insertCtx, pending)
		cancel()
		if err != nil {
			logger.Error("clickhouse insert",
				zap.Error(err),
				zap.Int("batch_rows", len(pending)),
				zap.String("reason", reason))
			m.RecordInsertFailure(len(pending))
			// Re-queue the messages back into the consumer so they
			// get re-tried. The simplest approach: publish each
			// message back to Kafka with a retry header. For now
			// we log and rely on the consumer re-reading from the
			// last uncommitted offset on restart.
			return
		}
		m.RecordInsertSuccess(len(pending))
		if err := cons.Commit(ctx, pendingMeta); err != nil {
			logger.Error("kafka commit", zap.Error(err))
			return
		}
		logger.Debug("flushed batch",
			zap.Int("rows", len(pending)),
			zap.String("reason", reason))
		pending = pending[:0]
		pendingMeta = pendingMeta[:0]
	}

	for {
		select {
		case <-ctx.Done():
			flush("shutdown")
			return ctx.Err()
		case <-flushTimer.C:
			flush("timer")
		default:
			// Read one message with a short timeout so we can flush
			// on the timer even when traffic is low.
			readCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
			msg, ok, err := cons.Next(readCtx)
			cancel()
			if err != nil {
				if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
					continue
				}
				logger.Error("kafka read", zap.Error(err))
				m.RecordKafkaReadError()
				time.Sleep(500 * time.Millisecond)
				continue
			}
			if !ok {
				// No message this tick — flush if timer says so.
				select {
				case <-flushTimer.C:
					flush("timer")
				default:
				}
				continue
			}
			var rec model.IngestRecord
			if err := json.Unmarshal(msg.Value, &rec); err != nil {
				// Bad JSON — send to DLQ and skip.
				logger.Warn("invalid json; routing to dlq",
					zap.Int64("offset", msg.Offset),
					zap.Error(err))
				if dlqErr := cons.SendToDLQ(ctx, msg, "parse_error"); dlqErr != nil {
					logger.Error("dlq publish", zap.Error(dlqErr))
				}
				m.RecordDlq("parse")
				// Still commit — bad data should not block the topic.
				_ = cons.Commit(ctx, []kafka.Message{msg})
				continue
			}
			pending = append(pending, rec)
			pendingMeta = append(pendingMeta, msg)
			if len(pending) >= cfg.BatchMaxRows {
				flush("size")
			}
		}
	}
}
