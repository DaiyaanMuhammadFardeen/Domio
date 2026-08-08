// Intercom adapter for crm-sync (Phase 17 W7).
//
// Intercom's contact model is simpler than HubSpot / Salesforce:
// "contacts" map directly onto users (with role=user) or "leads"
// (role=lead). The workspace's analytics-sdk identifies viewers by
// viewer_id_key; we treat every record as a contact upsert and add
// an "engagement_score" tag derived from the event name so sales
// can filter high-intent viewers in Intercom's UI.
package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/ratelimit"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// Intercom is the CRM adapter for Intercom.
type Intercom struct {
	httpClient *http.Client
	bucket     *ratelimit.Bucket
	logger     *zap.Logger
}

// NewIntercom returns a configured Intercom adapter. The bucket is
// sized to Intercom's per-workspace rate limit (500 / min ≈ 8.3/s);
// we use 10/s so a small burst is allowed without bursting the API.
func NewIntercom(logger *zap.Logger) *Intercom {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Intercom{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		bucket:     ratelimit.New(10, 10),
		logger:     logger,
	}
}

// Name returns the provider name.
func (i *Intercom) Name() string { return "intercom" }

// intercomContactRequest is the JSON Intercom's contacts API expects.
type intercomContactRequest struct {
	Role         string            `json:"role"`
	ExternalID   string            `json:"external_id"`
	Email        string            `json:"email,omitempty"`
	Phone        string            `json:"phone,omitempty"`
	Name         string            `json:"name,omitempty"`
	CustomFields map[string]string `json:"custom_attributes,omitempty"`
	Tags         []tagRef          `json:"tags,omitempty"`
}

type tagRef struct {
	Name string `json:"name"`
}

// Push upserts an Intercom contact (role=user) and attaches the
// event name as a tag. Tagging is idempotent on Intercom's side —
// the same name added twice stays at one tag.
func (i *Intercom) Push(ctx context.Context, conn registry.Connection, rec registry.Record) error {
	if err := i.bucket.Wait(ctx); err != nil {
		return err
	}
	body := intercomContactRequest{
		Role:         "user",
		ExternalID:   rec.ViewerIDKey,
		Email:        rec.Email,
		Name:         joinNonEmpty(" ", rec.FirstName, rec.LastName),
		CustomFields: map[string]string{
			"company":    rec.Company,
			"event_name": rec.EventName,
			"event_id":   rec.EventID,
		},
		Tags: []tagRef{{Name: "domio:" + rec.EventName}},
	}
	for k, v := range rec.Properties {
		body.CustomFields[k] = v
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("intercom: marshal: %w", err)
	}
	url := "https://api.intercom.io/contacts"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("intercom: new request: %w", err)
	}
	// Intercom uses "Bearer <access_token>".
	req.Header.Set("Authorization", "Bearer "+conn.AccessTokenCipher)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Intercom-Version", "2.11")

	resp, err := i.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("intercom: request: %w", err)
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
	return fmt.Errorf("intercom: upsert failed: status=%d body=%s", resp.StatusCode, truncate(string(respBody), 256))
}

// Pull is not implemented.
func (i *Intercom) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

// joinNonEmpty concatenates the non-empty parts with sep.
func joinNonEmpty(sep string, parts ...string) string {
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if out != "" {
			out += sep
		}
		out += p
	}
	return out
}
