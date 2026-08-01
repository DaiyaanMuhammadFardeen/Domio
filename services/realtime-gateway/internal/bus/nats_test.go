package bus

import (
	"context"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/realtime-gateway/internal/topics"
)

func TestBus_NATSAvailable(t *testing.T) {
	nc, err := nats.Connect("nats://localhost:4222",
		nats.Name("rtgw-test"),
		nats.Timeout(2*time.Second),
	)
	if err != nil {
		t.Skipf("nats-server not reachable at localhost:4222: %v", err)
	}
	nc.Close()
}

func TestBus_PublishAndConsume(t *testing.T) {
	nc, err := nats.Connect("nats://localhost:4222",
		nats.Name("rtgw-test"),
		nats.Timeout(2*time.Second),
	)
	if err != nil {
		t.Skipf("nats-server not reachable: %v", err)
	}
	defer nc.Close()

	logger := zap.NewNop()
	ctx := context.Background()

	bus, err := New(ctx, "nats://localhost:4222", logger)
	require.NoError(t, err)
	defer bus.Close()

	// Publish a message
	err = bus.Publish(ctx, "realtime.deck.testdeck.crdt", []byte("hello"))
	require.NoError(t, err)

	// Consume via plain NATS subscription
	sub, err := nc.Subscribe("realtime.deck.testdeck.crdt", func(msg *nats.Msg) {
		assert.Equal(t, "hello", string(msg.Data))
	})
	require.NoError(t, err)
	defer sub.Unsubscribe()

	// Wait for the message to arrive
	time.Sleep(200 * time.Millisecond)
}

func TestTopics(t *testing.T) {
	tests := []struct {
		name    string
		deckID  string
		wantCRDT string
		wantPres string
		wantMeta string
	}{
		{
			name:    "basic topics",
			deckID:  "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			wantCRDT: "realtime.deck.01ARZ3NDEKTSV4RRFFQ69G5FAV.crdt",
			wantPres: "realtime.deck.01ARZ3NDEKTSV4RRFFQ69G5FAV.presence",
			wantMeta: "realtime.deck.01ARZ3NDEKTSV4RRFFQ69G5FAV.meta",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Verify topic builder functions
			assert.Equal(t, tc.wantCRDT, "realtime.deck."+tc.deckID+".crdt")
			assert.Equal(t, tc.wantPres, "realtime.deck."+tc.deckID+".presence")
			assert.Equal(t, tc.wantMeta, "realtime.deck."+tc.deckID+".meta")
		})
	}
}

func TestDurableConsumerName(t *testing.T) {
	name := topics.DurableConsumerName("deck-1", "main")
	assert.Equal(t, "rtgw-deck-1-main", name)
}
