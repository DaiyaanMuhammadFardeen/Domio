// Package clickhouse owns the writer that batches IngestRecord values
// into a single INSERT statement and pushes it to ClickHouse.
//
// The writer uses the native ClickHouse protocol (clickhouse-go/v2)
// for low-latency batch inserts. The destination table is the `events`
// table created by infrastructure/clickhouse/init/001_phase17_schema.sql.
package clickhouse

import (
	"context"
	"errors"
	"fmt"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"go.uber.org/zap"

	"github.com/domio/platform/services/clickhouse-loader/internal/metrics"
	"github.com/domio/platform/services/clickhouse-loader/internal/model"
)

// Config is the connection parameters for the ClickHouse writer.
type Config struct {
	Addr    string
	DB      string
	User    string
	Pass    string
	Logger  *zap.Logger
	Metrics *metrics.Metrics
}

// Writer is a thin wrapper that owns a driver.Conn.Connections are
// not goroutine-safe in the underlying client, so we maintain a small
// pool internally.
type Writer struct {
	conn driver.Conn
	cfg  Config
}

// NewWriter opens a ClickHouse connection and pings to confirm it
// works before returning.
func NewWriter(cfg Config) (*Writer, error) {
	if cfg.Addr == "" {
		return nil, errors.New("clickhouse addr is required")
	}
	opts := &ch.Options{
		Addr:        []string{cfg.Addr},
		DialTimeout: 5 * time.Second,
		Compression: &ch.Compression{Method: ch.CompressionLZ4},
		Auth: ch.Auth{
			Database: cfg.DB,
			Username: cfg.User,
			Password: cfg.Pass,
		},
		MaxOpenConns: 8,
		MaxIdleConns: 4,
	}
	conn, err := ch.Open(opts)
	if err != nil {
		return nil, fmt.Errorf("clickhouse open: %w", err)
	}
	if err := conn.Ping(context.Background()); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}
	cfg.Logger.Info("clickhouse connected",
		zap.String("addr", cfg.Addr),
		zap.String("db", cfg.DB))
	return &Writer{conn: conn, cfg: cfg}, nil
}

// Insert batches the records into a single INSERT statement.
// The destination columns mirror the schema defined in
// infrastructure/clickhouse/init/001_phase17_schema.sql.
func (w *Writer) Insert(ctx context.Context, records []model.IngestRecord) error {
	if len(records) == 0 {
		return nil
	}
	start := time.Now()
	// Use a single multi-row INSERT. The native protocol is the fastest
	// path for high-throughput bulk loading.
	batch, err := w.conn.PrepareBatch(ctx, `
		INSERT INTO events
		(event_id, event_name, schema_version, ts, ts_ms,
		 workspace_id, deck_id, slide_id, viewer_id_key, session_id_key,
		 privacy_mode, device_class, source_app, ingest_topic,
		 region_pinned, live_session_id, raw)
	`)
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}
	for _, r := range records {
		ts := r.EventTime()
		err := batch.Append(
			r.EventID,
			r.EventName,
			r.SchemaVersion,
			ts,
			r.TsMs,
			r.WorkspaceID,
			r.DeckID,
			r.SlideID,
			r.ViewerIDKey,
			r.SessionIDKey,
			r.PrivacyMode,
			r.DeviceClass,
			r.SourceApp,
			r.IngestTopic,
			r.RegionPinned,
			r.LiveSessionID,
			string(r.Raw),
		)
		if err != nil {
			return fmt.Errorf("batch append: %w", err)
		}
	}
	if err := batch.Send(); err != nil {
		return fmt.Errorf("batch send: %w", err)
	}
	if w.cfg.Metrics != nil {
		w.cfg.Metrics.RecordInsertLatency(time.Since(start).Seconds())
	}
	return nil
}

// Close releases the connection.
func (w *Writer) Close() error {
	if w.conn == nil {
		return nil
	}
	return w.conn.Close()
}
