// Outreach adapter for crm-sync (Phase 17 W7).
//
// Outreach is a sales-engagement platform; the two endpoints we
// care about for CRM sync are:
//   * mailboxes — represents a sender (a sales rep's email)
//   * sequences — represents a multi-step outreach cadence
//
// The adapter upserts both, attaching the analytics event_name as
// a custom field so the dashboard can correlate open/reply rates
// back to specific event types.
package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/ratelimit"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// Outreach is the CRM adapter for Outreach.
type Outreach struct {
	httpClient *http.Client
	bucket     *ratelimit.Bucket
	logger     *zap.Logger
}

// NewOutreach returns a configured Outreach adapter.
func NewOutreach(logger *zap.Logger) *Outreach {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Outreach{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		bucket:     ratelimit.New(20, 20),
		logger:     logger,
	}
}

// Name returns the provider name.
func (o *Outreach) Name() string { return "outreach" }

// Push upserts a sequence (or, when the event name is "view",
// a mailbox) on Outreach. The choice is driven by EventName so the
// same registry.Record can drive both surfaces without a new field.
//
// Auth: HTTP Basic with the access token as the username and an
// empty password (per Outreach's "Personal Access Token" pattern).
func (o *Outreach) Push(ctx context.Context, conn registry.Connection, rec registry.Record) error {
	if err := o.bucket.Wait(ctx); err != nil {
		return err
	}

	endpoint, body, err := o.buildRequest(conn, rec)
	if err != nil {
		return err
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("outreach: marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("outreach: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+conn.AccessTokenCipher)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, err := o.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("outreach: request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		ra := parseRetryAfterMs(resp.Header.Get("Retry-After"))
		return &registry.ErrRateLimited{RetryAfterMs: ra}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("outreach: upsert failed: status=%d body=%s", resp.StatusCode, truncate(string(respBody), 256))
}

// Pull is not implemented.
func (o *Outreach) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

// buildRequest maps an analytics event onto the right Outreach
// endpoint + JSON:API body. Sequence for any event name other than
// "view" (which we treat as a mailbox upsert so every viewer has
// at least one of each entity for the dashboard).
func (o *Outreach) buildRequest(_ registry.Connection, rec registry.Record) (string, map[string]interface{}, error) {
	attrs := map[string]interface{}{
		"name":            "domio-" + strings.ToLower(rec.EventName),
		"description":     "Auto-created by domio crm-sync for event " + rec.EventID,
		"eventNameCustom": rec.EventName,
		"viewerIdKey":     rec.ViewerIDKey,
	}
	for k, v := range rec.Properties {
		attrs[k] = v
	}
	if rec.EventName == "view" {
		return "https://api.outreach.io/api/v2/mailboxes", map[string]interface{}{
			"data": map[string]interface{}{
				"type": "mailbox",
				"attributes": map[string]interface{}{
					"email":   rec.Email,
					"name":    "domio-" + strings.ToLower(rec.EventName),
					"eventId": rec.EventID,
				},
			},
		}, nil
	}
	return "https://api.outreach.io/api/v2/sequences", map[string]interface{}{
		"data": map[string]interface{}{
			"type":       "sequence",
			"attributes": attrs,
		},
	}, nil
}
