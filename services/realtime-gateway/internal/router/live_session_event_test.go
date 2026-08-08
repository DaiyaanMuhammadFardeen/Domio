// Tests for buildLiveSessionEvent — the Phase 17 W0 helper that wraps a
// CRDT op as a live_session_event JSON envelope before fan-out to the
// analytics ingest plane (NATS subject analytics.ingest.live.{sessionID}).
package router

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildLiveSessionEvent_HappyPath(t *testing.T) {
	payload := []byte(`{"hello":"world"}`)
	env, err := buildLiveSessionEvent("crdt_state_apply", "sess-abc", "deck-xyz", "actor-1", payload)
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(env, &got))

	assert.Equal(t, "crdt_state_apply", got["live_event_kind"])
	assert.Equal(t, "sess-abc", got["session_id"])
	assert.Equal(t, "deck-xyz", got["deck_id"])
	assert.Equal(t, "actor-1", got["viewer_id_key"])
	assert.Equal(t, "rtgw", got["source_app"])
	assert.Equal(t, "events.ingest.raw", got["ingest_topic"])
	assert.Equal(t, "global", got["region_pinned"])
	assert.Equal(t, true, got["forward_compat"])
	assert.EqualValues(t, len(payload), got["payload_size_bytes"])

	decoded, derr := base64.StdEncoding.DecodeString(got["live_event_data"].(string))
	require.NoError(t, derr)
	assert.Equal(t, payload, decoded)
}

func TestBuildLiveSessionEvent_EmptySessionID(t *testing.T) {
	_, err := buildLiveSessionEvent("crdt_state_apply", "", "deck-xyz", "actor-1", []byte(`{}`))
	require.Error(t, err)
}

func TestBuildLiveSessionEvent_EmptyKind(t *testing.T) {
	_, err := buildLiveSessionEvent("", "sess-abc", "deck-xyz", "actor-1", []byte(`{}`))
	require.Error(t, err)
}