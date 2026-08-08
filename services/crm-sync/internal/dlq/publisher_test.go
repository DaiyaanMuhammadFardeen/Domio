package dlq

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInMemoryPublisher(t *testing.T) {
	p := &InMemoryPublisher{}
	require.NoError(t, p.Publish(context.Background(), Message{ConnectionID: "c-1", EventID: "e-1"}))
	require.NoError(t, p.Publish(context.Background(), Message{ConnectionID: "c-1", EventID: "e-2"}))
	require.Len(t, p.Messages, 2)
	require.Equal(t, "e-1", p.Messages[0].EventID)
	require.NoError(t, p.Close())
}

func TestNatsPublisherBadURL(t *testing.T) {
	_, err := NewNatsPublisher(context.Background(), "nats://invalid.invalid:4222", nil)
	require.Error(t, err)
}

func TestMessageFields(t *testing.T) {
	m := Message{
		WorkspaceID:    "w-1",
		ConnectionID:   "c-1",
		ViewerIDKey:    "v-1",
		EventID:        "e-1",
		EventName:      "view",
		IdempotencyKey: "abc",
		Attempts:       5,
		LastError:      "boom",
		FailedAtMs:     1700000000000,
	}
	require.Equal(t, "w-1", m.WorkspaceID)
	require.Equal(t, "c-1", m.ConnectionID)
	require.Equal(t, 5, m.Attempts)
}
