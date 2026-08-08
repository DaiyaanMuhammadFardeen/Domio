// Package clickhouse owns the writer that pushes crm-sync state
// into the warehouse. The writer uses ClickHouse's HTTP interface
// (text/plain INSERT) so the crm-sync worker can be deployed with
// only a single HTTP client dependency — no native protocol.
package clickhouse

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

// Config is the connection parameters for the ClickHouse HTTP writer.
type Config struct {
	URL    string // e.g. http://clickhouse:8123
	User   string
	Pass   string
	DB     string
	TLS    bool
	Logger *zap.Logger
}

// Writer is a thin wrapper around http.Client.
type Writer struct {
	cfg    Config
	client *http.Client
}

// NewWriter builds a Writer and pings the server.
func NewWriter(cfg Config) (*Writer, error) {
	if cfg.URL == "" {
		return nil, errors.New("clickhouse URL is required")
	}
	if cfg.Logger == nil {
		cfg.Logger = zap.NewNop()
	}
	tr := &http.Transport{
		TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
		MaxIdleConnsPerHost: 4,
	}
	w := &Writer{
		cfg: cfg,
		client: &http.Client{
			Timeout:   15 * time.Second,
			Transport: tr,
		},
	}
	// Liveness probe.
	res, err := w.client.Get(strings.TrimRight(cfg.URL, "/") + "/?query=SELECT%201")
	if err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("clickhouse ping: status=%d body=%s", res.StatusCode, body)
	}
	cfg.Logger.Info("clickhouse connected",
		zap.String("url", cfg.URL),
		zap.String("db", cfg.DB))
	return w, nil
}

// Record is the wire shape the warehouse expects. Mirrors
// domio_analytics.crm_sync_record.
type Record struct {
	SyncID         string
	WorkspaceID    string
	ConnectionID   string
	ViewerIDKey    string
	EventID        string
	EventName      string
	State          string
	Attempts       uint32
	LastError      string
	SyncedAt       *time.Time
	NextRetryAt    *time.Time
	CreatedAt      time.Time
	IdempotencyKey string
	Provider       string
}

// Insert upserts a batch of records. The destination table is
// domio_analytics.crm_sync_record; the INSERT uses JSONEachRow
// because the crm-sync worker is low-throughput (one write per
// CRM event, never bulk load).
func (w *Writer) Insert(ctx context.Context, records []Record) error {
	if len(records) == 0 {
		return nil
	}
	var buf bytes.Buffer
	for _, r := range records {
		row := map[string]interface{}{
			"workspace_id":     r.WorkspaceID,
			"connection_id":    r.ConnectionID,
			"viewer_id_key":    r.ViewerIDKey,
			"event_id":         r.EventID,
			"event_name":       r.EventName,
			"state":            r.State,
			"attempts":         r.Attempts,
			"last_error":       r.LastError,
			"idempotency_key":  r.IdempotencyKey,
			"provider":         r.Provider,
		}
		if r.SyncedAt != nil {
			row["synced_at"] = r.SyncedAt.UTC().Format("2006-01-02 15:04:05.000")
		}
		if r.NextRetryAt != nil {
			row["next_retry_at"] = r.NextRetryAt.UTC().Format("2006-01-02 15:04:05.000")
		}
		if !r.CreatedAt.IsZero() {
			row["created_at"] = r.CreatedAt.UTC().Format("2006-01-02 15:04:05.000")
		}
		b, err := json.Marshal(row)
		if err != nil {
			return fmt.Errorf("marshal row: %w", err)
		}
		buf.Write(b)
		buf.WriteByte('\n')
	}

	url := strings.TrimRight(w.cfg.URL, "/") + "/?query=" + urlQuery("INSERT INTO crm_sync_record FORMAT JSONEachRow")
	if w.cfg.DB != "" {
		url += "&database=" + urlQuery(w.cfg.DB)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &buf)
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	if w.cfg.User != "" || w.cfg.Pass != "" {
		req.SetBasicAuth(w.cfg.User, w.cfg.Pass)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("clickhouse insert: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("clickhouse insert: status=%d body=%s", res.StatusCode, body)
	}
	return nil
}

// urlQuery URL-encodes a string for use as a query parameter value.
func urlQuery(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == ' ':
			b.WriteString("%20")
		case r == '"':
			b.WriteString("%22")
		case r == '&':
			b.WriteString("%26")
		case r == '=':
			b.WriteString("%3D")
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
