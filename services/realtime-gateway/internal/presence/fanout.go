package presence

import (
	"context"
	"encoding/json"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	"github.com/domio/platform/services/realtime-gateway/internal/session"
)

// Fanout sends presence deltas to all sessions subscribed to a deck.
type Fanout struct {
	store    *RedisPresence
	sessions session.SessionStore
	logger   *zap.Logger
}

// NewFanout creates a new presence fanout handler.
func NewFanout(store *RedisPresence, sessions session.SessionStore, logger *zap.Logger) *Fanout {
	return &Fanout{
		store:    store,
		sessions: sessions,
		logger:   logger,
	}
}

// BroadcastPresence sends a presence delta to all sessions on the deck
// (both local WebSocket sessions and via NATS for cross-gateway fanout).
func (f *Fanout) BroadcastPresence(ctx context.Context, deckID string, pres *rt.Presence) error {
	// Store in Redis.
	if err := f.store.Set(ctx, deckID, pres); err != nil {
		f.logger.Warn("presence: redis set failed", zap.Error(err))
	}

	// Marshal the presence for local WebSocket broadcast.
	data, err := proto.Marshal(pres)
	if err != nil {
		return err
	}

	// Fan out to local sessions on the same deck.
	sessions := f.sessions.GetByDeck(deckID)
	for _, sess := range sessions {
		// Don't echo back to the sender.
		if sess.ActorID == pres.GetActorId() {
			continue
		}
		if !sess.Send(data) {
			f.logger.Warn("presence: slow client, skipping",
				zap.String("session_id", sess.ID))
		}
	}

	return nil
}

// BroadcastPresenceDelta sends a delta presence update via NATS for
// cross-gateway fan-out.
func (f *Fanout) PublishPresenceDelta(ctx context.Context, rdb *redis.Client, deckID string, pres *rt.Presence) error {
	data, err := json.Marshal(pres)
	if err != nil {
		return err
	}

	// Publish to a Redis Pub/Sub channel for cross-gateway fanout.
	// In production this would be NATS JetStream; using Redis for simplicity.
	ch := "realtime.deck." + deckID + ".presence"
	return rdb.Publish(ctx, ch, data).Err()
}
