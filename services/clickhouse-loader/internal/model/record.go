// Package model holds the data shapes the loader shuttles between
// Kafka and ClickHouse.
package model

import (
	"encoding/json"
	"time"
)

// IngestRecord is the canonical representation of an analytics event
// as it lands in ClickHouse. It is intentionally permissive (Raw is a
// map) so events with new optional fields don't require a code change
// in the loader — ClickHouse column expressions are validated against
// the schema migration, not against the Go struct.
//
// Field tags match the events table defined in
// infrastructure/clickhouse/init/001_phase17_schema.sql.
type IngestRecord struct {
	EventID         string          `json:"event_id"               ch:"event_id"`
	EventName       string          `json:"event_name"             ch:"event_name"`
	SchemaVersion   uint16          `json:"schema_version"         ch:"schema_version"`
	TsMs            int64           `json:"ts_ms"                  ch:"ts_ms"`
	WorkspaceID     string          `json:"workspace_id"           ch:"workspace_id"`
	DeckID          string          `json:"deck_id"                ch:"deck_id"`
	SlideID         string          `json:"slide_id,omitempty"     ch:"slide_id"`
	ViewerIDKey     string          `json:"viewer_id_key"          ch:"viewer_id_key"`
	SessionIDKey    string          `json:"session_id_key"         ch:"session_id_key"`
	PrivacyMode     string          `json:"privacy_mode"           ch:"privacy_mode"`
	DeviceClass     string          `json:"device_class"           ch:"device_class"`
	SourceApp       string          `json:"source_app"             ch:"source_app"`
	IngestTopic     string          `json:"ingest_topic"           ch:"ingest_topic"`
	RegionPinned    string          `json:"region_pinned,omitempty" ch:"region_pinned"`
	LiveSessionID   string          `json:"live_session_id,omitempty" ch:"live_session_id"`
	Raw             json.RawMessage `json:"raw"                    ch:"-"`
}

// EventTime converts TsMs (epoch ms) into time.Time for ClickHouse DateTime64.
func (r IngestRecord) EventTime() time.Time {
	return time.UnixMilli(r.TsMs).UTC()
}
