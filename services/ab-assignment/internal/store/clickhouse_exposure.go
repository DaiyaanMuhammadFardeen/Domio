// ClickHouse exposure writer.
//
// When an exposure event is recorded by the assignment service, we
// fan it out to ClickHouse `ab_exposure` so the measurement service
// can read aggregates without joining Postgres.
//
// The writer is a thin HTTP wrapper that issues a JSONEachRow INSERT.
// We don't use the native ClickHouse protocol because:
//
//   * The payload is small (one row per exposure).
//   * The hot path doesn't want a long-lived connection that fails
//     and retries at the wrong moments.
//   * HTTP retry logic is simpler to test.
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/model"
)

// ClickHouseExposureWriter writes exposures to ClickHouse via HTTP.
type ClickHouseExposureWriter struct {
	url      string
	database string
	username string
	password string
	hc       *http.Client
}

// NewClickHouseExposureWriter returns a writer pointed at the given CH endpoint.
func NewClickHouseExposureWriter(url, database, user, password string) *ClickHouseExposureWriter {
	return &ClickHouseExposureWriter{
		url:      url,
		database: database,
		username: user,
		password: password,
		hc: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// ExposureRow is the wire format written to ClickHouse. Mirrors the
// ab_exposure schema in 004_phase17_heatmap.sql.
type ExposureRowCH struct {
	WorkspaceID   string `json:"workspace_id"`
	TestID        string `json:"test_id"`
	ViewerIDKey   string `json:"viewer_id_key"`
	VariantID     string `json:"variant_id"`
	ExposureEvent string `json:"exposure_event"`
	IsConversion  uint8  `json:"is_conversion"`
	OccurredAt    string `json:"occurred_at"`
	CHEventID     string `json:"ch_event_id,omitempty"`
}

// Write sends one exposure row to ClickHouse. Failure is non-fatal for
// the hot path — the assignment itself succeeded; ClickHouse is the
// measurement-side cache and the worker will retry. We still log the
// error in the caller.
func (w *ClickHouseExposureWriter) Write(ctx context.Context, e model.ExposureRow) error {
	if w.url == "" {
		return nil
	}
	row := ExposureRowCH{
		WorkspaceID:   e.WorkspaceID.String(),
		TestID:        e.TestID.String(),
		ViewerIDKey:   e.ViewerIDKey,
		VariantID:     e.VariantID.String(),
		ExposureEvent: e.ExposureEvent,
		IsConversion:  uint8(e.IsConversion),
		OccurredAt:    e.OccurredAt.UTC().Format("2006-01-02 15:04:05.000"),
		CHEventID:     e.CHEventID,
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	if err := enc.Encode(row); err != nil {
		return fmt.Errorf("encode exposure: %w", err)
	}
	u := fmt.Sprintf("%s/?database=%s&query=INSERT INTO ab_exposure FORMAT JSONEachRow", w.url, w.database)
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

// Schema is the CREATE TABLE statement for ab_exposure, used by the
// migration in infrastructure/clickhouse/init/004_phase17_heatmap.sql
// (and re-emitted here so tests can build a scratch DB).
func (w *ClickHouseExposureWriter) Schema() string {
	return `
CREATE TABLE IF NOT EXISTS ab_exposure
(
    workspace_id      LowCardinality(String),
    test_id           LowCardinality(String),
    viewer_id_key     String,
    variant_id        LowCardinality(String),
    exposure_event    LowCardinality(String),
    is_conversion     UInt8 DEFAULT 0,
    occurred_at       DateTime64(3, 'UTC'),
    ch_event_id       String DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, test_id, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 13 MONTH DELETE;`
}

// ParseExposureID is a helper that returns a uuid.Nil-safe ID string.
func ParseExposureID(id uuid.UUID) string {
	return id.String()
}