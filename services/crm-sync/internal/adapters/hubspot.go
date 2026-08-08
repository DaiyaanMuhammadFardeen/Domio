// Package adapters implements concrete CRM provider adapters. Each
// adapter translates the provider-agnostic registry.Record into the
// provider's wire format and back.
//
// Adapters MUST respect the rate-limit hint from the connection and
// MUST surface provider errors as registry.ErrRateLimited (for
// transient 429s) or a generic error (for permanent failures). The
// orchestrator decides retry vs. DLQ based on the error class.
package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/ratelimit"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// HubSpot is the Marketing/CRM adapter for HubSpot. It enforces the
// public marketing-tier rate limit (100 requests / 10s, burst of
// 100 tokens). The bucket refills at 10 tokens/second so a sustained
// 10 rps is always achievable.
type HubSpot struct {
	httpClient *http.Client
	bucket     *ratelimit.Bucket
	logger     *zap.Logger
}

// NewHubSpot returns a configured HubSpot adapter.
func NewHubSpot(logger *zap.Logger) *HubSpot {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &HubSpot{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		bucket:     ratelimit.New(100, 10), // 100 burst, 10/s sustained
		logger:     logger,
	}
}

// SetTransportForTest swaps the underlying http.RoundTripper. It
// exists so tests can route requests through httptest servers while
// keeping the production client (timeouts, etc.) intact.
func (h *HubSpot) SetTransportForTest(rt http.RoundTripper) {
	h.httpClient = &http.Client{Timeout: h.httpClient.Timeout, Transport: rt}
}

// Name returns the provider name.
func (h *HubSpot) Name() string { return "hubspot" }

// hubspotContactProperty is the JSON shape HubSpot's contact upsert
// endpoint expects. Only "properties" is required.
type hubspotContactProperty struct {
	Properties map[string]string `json:"properties"`
}

// Push upserts a contact on HubSpot. The endpoint is
//   POST https://api.hubapi.com/crm/v3/objects/contacts
// Authentication is HTTP Basic with the access token as the username
// (per HubSpot's "Private app access token" pattern).
func (h *HubSpot) Push(ctx context.Context, conn registry.Connection, rec registry.Record) error {
	if err := h.bucket.Wait(ctx); err != nil {
		return err
	}
	body := hubspotContactProperty{
		Properties: h.toProperties(rec),
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("hubspot: marshal: %w", err)
	}
	url := "https://api.hubapi.com/crm/v3/objects/contacts"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("hubspot: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+conn.AccessTokenCipher)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("hubspot: request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		ra := parseRetryAfterMs(resp.Header.Get("Retry-After"))
		return &registry.ErrRateLimited{RetryAfterMs: ra}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Drain body so keep-alive works.
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("hubspot: upsert failed: status=%d body=%s", resp.StatusCode, truncate(string(respBody), 256))
}

// Pull is not implemented for HubSpot in this milestone — contact
// reads go through the analytics-warehouse (Phase 17 W2), not this
// worker. Returns an empty slice.
func (h *HubSpot) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

// toProperties maps a registry.Record onto HubSpot's contact
// property names. The mapping is hard-coded for the v1 release; v2
// will read crm_sync_field_map from Postgres.
func (h *HubSpot) toProperties(rec registry.Record) map[string]string {
	p := map[string]string{
		"viewer_id_key": rec.ViewerIDKey,
		"event_name":    rec.EventName,
		"event_id":      rec.EventID,
		"firstname":     rec.FirstName,
		"lastname":      rec.LastName,
		"email":         rec.Email,
		"company":       rec.Company,
	}
	for k, v := range rec.Properties {
		p[strings.ToLower(k)] = v
	}
	return p
}

// parseRetryAfterMs converts a Retry-After header into milliseconds.
// Both the delta-seconds form ("5") and the HTTP-date form are
// supported; unknown → 1000ms default.
func parseRetryAfterMs(h string) int64 {
	if h == "" {
		return 1000
	}
	if sec, err := strconv.Atoi(h); err == nil {
		return int64(sec) * 1000
	}
	if t, err := http.ParseTime(h); err == nil {
		d := time.Until(t)
		if d > 0 {
			return d.Milliseconds()
		}
	}
	return 1000
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
