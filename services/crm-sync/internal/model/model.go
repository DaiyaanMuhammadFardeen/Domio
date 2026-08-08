// Package model holds the crm-sync domain types shared between the
// adapters, the orchestrator, the ClickHouse writer, and the DLQ
// publisher. These types deliberately avoid leaking adapter-specific
// fields (HubSpot contact property names, Salesforce sObjects, etc.)
// — that translation lives in each adapter package.
package model

import (
	"time"
)

// SyncRecord is the warehouse mirror of a (connection, viewer, event)
// sync attempt. The primary key is the connection_id + idempotency_key
// pair so retries collapse to a single row.
type SyncRecord struct {
	SyncID         string
	WorkspaceID    string
	ConnectionID   string
	ViewerIDKey    string
	EventID        string
	EventName      string
	State          string // 'success' | 'failed' | 'pending' | 'dead'
	Attempts       int
	LastError      string
	SyncedAt       *time.Time
	NextRetryAt    *time.Time
	IdempotencyKey string
}

// FieldMap is a single (source_field, target_field, transform) row in
// the crm_sync_field_map table. It tells the orchestrator how to map
// an AnalyticsEvent property onto a CRM contact field.
type FieldMap struct {
	MapID        string
	WorkspaceID  string
	ConnectionID string
	SourceField  string
	TargetField  string
	Transform    string
}

// CRMEvent is the input the orchestrator hands to an adapter. It is
// the same shape regardless of provider; each adapter translates
// fields into provider-specific property names.
type CRMEvent struct {
	WorkspaceID  string
	ConnectionID string
	ViewerIDKey  string
	EventID      string
	EventName    string
	Email        string
	FirstName    string
	LastName     string
	Company      string
	Tags         []string
	Properties   map[string]string
	OccurredAtMs int64
}

// Connection encapsulates the OAuth credentials + rate-limit hint for
// one workspace/provider pair. The ciphers are application-layer
// encrypted blobs the adapter never inspects.
type Connection struct {
	ConnectionID       string
	WorkspaceID        string
	Provider           string
	Label              string
	AccessTokenCipher  string
	RefreshTokenCipher string
	ExpiresAtUnixMs    int64
	RateLimitPerSec    int
	Enabled            bool
}
