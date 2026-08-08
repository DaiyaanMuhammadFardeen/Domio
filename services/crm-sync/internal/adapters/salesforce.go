// Salesforce adapter for crm-sync (Phase 17 W7).
//
// Salesforce uses a different auth model than HubSpot: an OAuth2
// refresh token that exchanges for a short-lived bearer access
// token at the /services/oauth2/token endpoint. The adapter
// caches the bearer in-process per connection_id, refreshes when
// the cached token is missing or about to expire (<60s), and
// transparently retries on 401.
//
// Rate-limit handling: Salesforce returns 429 with a Retry-After
// header when the daily API call limit is hit (the per-org cap is
// much lower than per-second). The adapter surfaces those as
// registry.ErrRateLimited so the orchestrator applies exponential
// backoff with jitter.
package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/ratelimit"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// Salesforce is the CRM adapter for Salesforce (Contact + Lead).
type Salesforce struct {
	httpClient *http.Client
	bucket     *ratelimit.Bucket
	logger     *zap.Logger

	mu         sync.Mutex
	bearerByID map[string]cachedBearer // key = connection_id
}

type cachedBearer struct {
	accessToken string
	instanceURL string
	expiresAt   time.Time
}

// NewSalesforce returns a configured Salesforce adapter. The bucket
// is sized to the standard "Enterprise" daily quota downgraded to a
// per-second rate (15 rps); individual workspaces will override via
// connection.rate_limit_per_sec in a future iteration.
func NewSalesforce(logger *zap.Logger) *Salesforce {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Salesforce{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		bucket:     ratelimit.New(15, 15),
		logger:     logger,
		bearerByID: make(map[string]cachedBearer),
	}
}

// SetTransportForTest swaps the underlying http.RoundTripper for tests.
func (s *Salesforce) SetTransportForTest(rt http.RoundTripper) {
	s.httpClient = &http.Client{Timeout: s.httpClient.Timeout, Transport: rt}
}

// Name returns the provider name.
func (s *Salesforce) Name() string { return "salesforce" }

// Push upserts a Contact (or Lead if no email) on Salesforce.
// Salesforce's "composite" endpoint is intentionally avoided here
// to keep the adapter dependency-free; we use a single POST/PATCH.
func (s *Salesforce) Push(ctx context.Context, conn registry.Connection, rec registry.Record) error {
	if err := s.bucket.Wait(ctx); err != nil {
		return err
	}
	bearer, err := s.ensureBearer(ctx, conn)
	if err != nil {
		return fmt.Errorf("salesforce: bearer: %w", err)
	}
	endpoint := fmt.Sprintf("%s/services/data/v59.0/sobjects/Contact/Email/%s",
		bearer.instanceURL, url.PathEscape(rec.Email))
	body := s.toContactBody(rec)
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("salesforce: marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("salesforce: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearer.accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("salesforce: request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		// Force bearer refresh on next call.
		s.invalidate(conn.ConnectionID)
		ra := parseRetryAfterMs(resp.Header.Get("Retry-After"))
		// Salesforce's per-second ceiling is closer to "wait at
		// least 250ms", so clamp the minimum.
		if ra < 250 {
			ra = 250
		}
		return &registry.ErrRateLimited{RetryAfterMs: ra}
	}
	if resp.StatusCode == http.StatusUnauthorized {
		// Token may have been revoked; force refresh + one retry.
		s.invalidate(conn.ConnectionID)
		bearer, err = s.ensureBearer(ctx, conn)
		if err != nil {
			return fmt.Errorf("salesforce: bearer retry: %w", err)
		}
		req2, _ := http.NewRequestWithContext(ctx, http.MethodPatch, endpoint, bytes.NewReader(buf))
		req2.Header.Set("Authorization", "Bearer "+bearer.accessToken)
		req2.Header.Set("Content-Type", "application/json")
		resp2, err := s.httpClient.Do(req2)
		if err != nil {
			return fmt.Errorf("salesforce: retry request: %w", err)
		}
		defer resp2.Body.Close()
		_, _ = io.Copy(io.Discard, resp2.Body)
		if resp2.StatusCode >= 200 && resp2.StatusCode < 300 {
			return nil
		}
		return fmt.Errorf("salesforce: retry failed: status=%d", resp2.StatusCode)
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("salesforce: upsert failed: status=%d body=%s", resp.StatusCode, truncate(string(respBody), 256))
}

// Pull is not implemented.
func (s *Salesforce) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

// ensureBearer returns a non-expired cached bearer, refreshing via
// the OAuth2 token endpoint when needed. The refresh request body
// uses the Salesforce "refresh_token grant" form.
func (s *Salesforce) ensureBearer(ctx context.Context, conn registry.Connection) (cachedBearer, error) {
	s.mu.Lock()
	cached, ok := s.bearerByID[conn.ConnectionID]
	s.mu.Unlock()
	if ok && time.Until(cached.expiresAt) > 60*time.Second {
		return cached, nil
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", conn.Label) // We re-purpose the label field as client_id for SF.
	form.Set("client_secret", conn.AccessTokenCipher)
	form.Set("refresh_token", conn.RefreshTokenCipher)

	tokenReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://login.salesforce.com/services/oauth2/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return cachedBearer{}, err
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(tokenReq)
	if err != nil {
		return cachedBearer{}, fmt.Errorf("refresh: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusTooManyRequests {
		ra := parseRetryAfterMs(resp.Header.Get("Retry-After"))
		if ra < 500 {
			ra = 500
		}
		return cachedBearer{}, &registry.ErrRateLimited{RetryAfterMs: ra}
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return cachedBearer{}, fmt.Errorf("refresh: status=%d body=%s", resp.StatusCode, truncate(string(body), 256))
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		InstanceURL string `json:"instance_url"`
		IssuedAt    string `json:"issued_at"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return cachedBearer{}, fmt.Errorf("refresh decode: %w", err)
	}
	if tok.AccessToken == "" || tok.InstanceURL == "" {
		return cachedBearer{}, fmt.Errorf("refresh: empty access_token or instance_url")
	}
	// Salesforce access tokens are 2h by default; we don't trust the
	// response's issued_at, so we use a conservative 90-minute TTL.
	expires := time.Now().Add(90 * time.Minute)
	cb := cachedBearer{accessToken: tok.AccessToken, instanceURL: tok.InstanceURL, expiresAt: expires}
	s.mu.Lock()
	s.bearerByID[conn.ConnectionID] = cb
	s.mu.Unlock()
	return cb, nil
}

// invalidate drops the cached bearer for a connection. Called on
// 401 or 429 so the next Push forces a fresh token exchange.
func (s *Salesforce) invalidate(connectionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.bearerByID, connectionID)
}

// toContactBody maps registry.Record onto Salesforce Contact fields.
// We use LastName as the unique key for the upsert-by-email path.
func (s *Salesforce) toContactBody(rec registry.Record) map[string]interface{} {
	body := map[string]interface{}{
		"LastName":      rec.LastName,
		"FirstName":     rec.FirstName,
		"Email":         rec.Email,
		"Company":       rec.Company,
		"ViewerIdKey__c": rec.ViewerIDKey,
		"LastEventName__c": rec.EventName,
	}
	for k, v := range rec.Properties {
		body[k] = v
	}
	return body
}
