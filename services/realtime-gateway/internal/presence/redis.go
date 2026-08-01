// Package presence manages realtime presence state backed by Redis.
package presence

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/redis/go-redis/v9"
)

const (
	// PresenceExpiry is how long a session key lives without a heartbeat.
	PresenceExpiry = 60 * time.Second
)

// RedisPresence stores and retrieves presence state in Redis.
type RedisPresence struct {
	rdb *redis.Client
}

// NewRedisPresence creates a new Redis-backed presence store.
func NewRedisPresence(rdb *redis.Client) *RedisPresence {
	return &RedisPresence{rdb: rdb}
}

// sessionPayload is the JSON structure stored per actor in the Redis hash.
type sessionPayload struct {
	ActorID   string            `json:"actor_id"`
	SessionID string            `json:"session_id"`
	State     map[string]string `json:"state,omitempty"`
	LastSeen  time.Time         `json:"last_seen"`
}

func presenceHashKey(deckID string) string {
	return fmt.Sprintf("deck:%s:presence", deckID)
}

// Set records or updates an actor's presence in a deck hash.
func (p *RedisPresence) Set(ctx context.Context, deckID string, pres *rt.Presence) error {
	payload := sessionPayload{
		ActorID:   pres.GetActorId(),
		SessionID: pres.GetSessionId(),
		State:     pres.GetState(),
		LastSeen:  time.Now(),
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("presence: marshal: %w", err)
	}

	key := presenceHashKey(deckID)
	pipe := p.rdb.Pipeline()
	pipe.HSet(ctx, key, pres.GetActorId(), data)
	pipe.Expire(ctx, key, PresenceExpiry)
	_, err = pipe.Exec(ctx)
	return err
}

// Remove deletes an actor's presence from a deck hash.
func (p *RedisPresence) Remove(ctx context.Context, deckID, actorID string) error {
	return p.rdb.HDel(ctx, presenceHashKey(deckID), actorID).Err()
}

// Get retrieves a single actor's presence.
func (p *RedisPresence) Get(ctx context.Context, deckID, actorID string) (*rt.Presence, error) {
	data, err := p.rdb.HGet(ctx, presenceHashKey(deckID), actorID).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var sp sessionPayload
	if err := json.Unmarshal(data, &sp); err != nil {
		return nil, err
	}
	return &rt.Presence{
		ActorId:   sp.ActorID,
		SessionId: sp.SessionID,
		State:     sp.State,
		Kind:      rt.PresenceKind_PRESENCE_KIND_UPDATE,
	}, nil
}

// GetAll retrieves all active presences for a deck.
func (p *RedisPresence) GetAll(ctx context.Context, deckID string) ([]*rt.Presence, error) {
	data, err := p.rdb.HGetAll(ctx, presenceHashKey(deckID)).Result()
	if err != nil {
		return nil, err
	}
	var out []*rt.Presence
	for _, raw := range data {
		var sp sessionPayload
		if err := json.Unmarshal([]byte(raw), &sp); err != nil {
			continue
		}
		out = append(out, &rt.Presence{
			ActorId:   sp.ActorID,
			SessionId: sp.SessionID,
			State:     sp.State,
			Kind:      rt.PresenceKind_PRESENCE_KIND_UPDATE,
		})
	}
	return out, nil
}

// TouchHeartbeat refreshes the expiry for an actor's presence.
func (p *RedisPresence) TouchHeartbeat(ctx context.Context, deckID, actorID string) error {
	key := presenceHashKey(deckID)
	return p.rdb.Expire(ctx, key, PresenceExpiry).Err()
}
