package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// ClickHouseSnapshotWriter writes BenchmarkSnapshot rows to
// domio_analytics.benchmark_snapshot via the HTTP JSONEachRow endpoint.
// The mirror table layout is in
// infrastructure/clickhouse/init/007_phase17_benchmark.sql.
type ClickHouseSnapshotWriter struct {
	url      string
	db       string
	username string
	password string
	hc       *http.Client
}

// NewClickHouseSnapshotWriter returns a writer. url is the ClickHouse
// HTTP endpoint (e.g. http://localhost:8123). If url is empty, writes
// are no-ops (useful for tests).
func NewClickHouseSnapshotWriter(url, db, user, password string) *ClickHouseSnapshotWriter {
	return &ClickHouseSnapshotWriter{
		url:      url,
		db:       db,
		username: user,
		password: password,
		hc: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SnapshotRow is the JSONEachRow shape — mirrors the table column order.
type SnapshotRow struct {
	WorkspaceID  string `json:"workspace_id"`
	BenchmarkID  string `json:"benchmark_id"`
	MetricName   string `json:"metric_name"`
	BucketDate   string `json:"bucket_date"`
	Value        float64 `json:"value"`
	SampleSize   uint32 `json:"sample_size"`
	RegionPinned string `json:"region_pinned"`
	UpdatedAt    string `json:"updated_at"`
}

// WriteSnapshot issues an INSERT against benchmark_snapshot.
func (w *ClickHouseSnapshotWriter) WriteSnapshot(ctx context.Context, snap model.BenchmarkSnapshot) error {
	if w.url == "" {
		return nil
	}
	row := SnapshotRow{
		WorkspaceID:  snap.WorkspaceID.String(),
		BenchmarkID:  snap.BenchmarkID.String(),
		MetricName:   snap.MetricName,
		BucketDate:   snap.BucketDate.UTC().Format("2006-01-02"),
		Value:        snap.Value,
		SampleSize:   snap.SampleSize,
		RegionPinned: snap.RegionPinned,
		UpdatedAt:    snap.UpdatedAt.UTC().Format("2006-01-02 15:04:05.000"),
	}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(row); err != nil {
		return fmt.Errorf("encode snapshot: %w", err)
	}
	q := url.Values{}
	q.Set("database", w.db)
	q.Set("query", "INSERT INTO benchmark_snapshot FORMAT JSONEachRow")
	u := fmt.Sprintf("%s/?%s", w.url, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, &buf)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	if w.username != "" || w.password != "" {
		req.SetBasicAuth(w.username, w.password)
	}
	req.Header.Set("content-type", "application/json")
	resp, err := w.hc.Do(req)
	if err != nil {
		return fmt.Errorf("clickhouse write: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("clickhouse status %d", resp.StatusCode)
	}
	return nil
}

// ReadSnapshots returns snapshots for the benchmark via a SELECT query.
// The mirror table layout is in 007_phase17_benchmark.sql.
func (w *ClickHouseSnapshotWriter) ReadSnapshots(ctx context.Context, benchmarkID uuid.UUID, metricName string) ([]model.BenchmarkSnapshot, error) {
	if w.url == "" {
		return nil, nil
	}
	q := fmt.Sprintf(
		"SELECT workspace_id, benchmark_id, metric_name, bucket_date, value, sample_size, region_pinned, updated_at FROM benchmark_snapshot WHERE benchmark_id = '%s'",
		strings.ReplaceAll(benchmarkID.String(), "'", "''"))
	if metricName != "" {
		q += fmt.Sprintf(" AND metric_name = '%s'", strings.ReplaceAll(metricName, "'", "''"))
	}
	q += " ORDER BY bucket_date ASC FORMAT JSONEachRow"
	qvals := url.Values{}
	qvals.Set("database", w.db)
	u := fmt.Sprintf("%s/?%s", w.url, qvals.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(q))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	if w.username != "" || w.password != "" {
		req.SetBasicAuth(w.username, w.password)
	}
	resp, err := w.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("clickhouse read: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("clickhouse status %d", resp.StatusCode)
	}
	out := make([]model.BenchmarkSnapshot, 0)
	dec := json.NewDecoder(resp.Body)
	for dec.More() {
		var r struct {
			WorkspaceID  string `json:"workspace_id"`
			BenchmarkID  string `json:"benchmark_id"`
			MetricName   string `json:"metric_name"`
			BucketDate   string `json:"bucket_date"`
			Value        float64 `json:"value"`
			SampleSize   uint32 `json:"sample_size"`
			RegionPinned string `json:"region_pinned"`
			UpdatedAt    string `json:"updated_at"`
		}
		if err := dec.Decode(&r); err != nil {
			return nil, fmt.Errorf("decode snapshot: %w", err)
		}
		wsID, err := uuid.Parse(r.WorkspaceID)
		if err != nil {
			return nil, fmt.Errorf("parse workspace_id: %w", err)
		}
		bid, err := uuid.Parse(r.BenchmarkID)
		if err != nil {
			return nil, fmt.Errorf("parse benchmark_id: %w", err)
		}
		day, err := time.Parse("2006-01-02", r.BucketDate)
		if err != nil {
			return nil, fmt.Errorf("parse bucket_date: %w", err)
		}
		updated, err := time.Parse("2006-01-02 15:04:05.000", r.UpdatedAt)
		if err != nil {
			// ClickHouse may omit fractional seconds if zero.
			updated, err = time.Parse("2006-01-02 15:04:05", r.UpdatedAt)
			if err != nil {
				return nil, fmt.Errorf("parse updated_at: %w", err)
			}
		}
		out = append(out, model.BenchmarkSnapshot{
			WorkspaceID:  wsID,
			BenchmarkID:  bid,
			MetricName:   r.MetricName,
			BucketDate:   day,
			Value:        r.Value,
			SampleSize:   r.SampleSize,
			RegionPinned: r.RegionPinned,
			UpdatedAt:    updated.UTC(),
		})
	}
	return out, nil
}

// Schema is the CREATE TABLE statement for benchmark_snapshot, used by
// the migration in infrastructure/clickhouse/init/007_phase17_benchmark.sql
// (and re-emitted here so tests can verify the wire shape).
func (w *ClickHouseSnapshotWriter) Schema() string {
	return `
CREATE TABLE IF NOT EXISTS benchmark_snapshot
(
    workspace_id    LowCardinality(String),
    benchmark_id    LowCardinality(String),
    metric_name     LowCardinality(String),
    bucket_date     Date,
    value           Float64,
    sample_size     UInt32,
    region_pinned   LowCardinality(String) DEFAULT '',
    updated_at      DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(bucket_date)
PARTITION BY toYYYYMM(bucket_date)
ORDER BY (workspace_id, benchmark_id, bucket_date);`
}
