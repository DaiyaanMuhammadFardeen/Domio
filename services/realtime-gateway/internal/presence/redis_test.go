package presence

import (
	"context"
	"testing"
	"time"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// connectRedis attempts to connect to Redis at localhost:6379.
// Returns nil if Redis is not reachable.
func connectRedis(t *testing.T) *redis.Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15}) // use DB 15 for tests
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("redis not reachable at localhost:6379: %v", err)
	}
	// Clean up test key
	rdb.FlushDB(ctx)
	return rdb
}

func TestRedisPresence_SetAndGet(t *testing.T) {
	rdb := connectRedis(t)
	if rdb == nil {
		return
	}
	defer rdb.Close()

	store := NewRedisPresence(rdb)
	ctx := context.Background()

	pres := &rt.Presence{
		ActorId:   "actor-1",
		SessionId: "sess-1",
		State:     map[string]string{"cursor": "10,20"},
		Kind:      rt.PresenceKind_PRESENCE_KIND_JOIN,
	}

	err := store.Set(ctx, "deck-test", pres)
	require.NoError(t, err)

	got, err := store.Get(ctx, "deck-test", "actor-1")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "actor-1", got.GetActorId())
	assert.Equal(t, "sess-1", got.GetSessionId())
	assert.Equal(t, "10,20", got.GetState()["cursor"])
}

func TestRedisPresence_Remove(t *testing.T) {
	rdb := connectRedis(t)
	if rdb == nil {
		return
	}
	defer rdb.Close()

	store := NewRedisPresence(rdb)
	ctx := context.Background()

	pres := &rt.Presence{
		ActorId:   "actor-1",
		SessionId: "sess-1",
		Kind:      rt.PresenceKind_PRESENCE_KIND_JOIN,
	}
	require.NoError(t, store.Set(ctx, "deck-test", pres))

	err := store.Remove(ctx, "deck-test", "actor-1")
	require.NoError(t, err)

	got, err := store.Get(ctx, "deck-test", "actor-1")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestRedisPresence_GetAll(t *testing.T) {
	rdb := connectRedis(t)
	if rdb == nil {
		return
	}
	defer rdb.Close()

	store := NewRedisPresence(rdb)
	ctx := context.Background()

	actors := []*rt.Presence{
		{ActorId: "actor-1", SessionId: "sess-1", Kind: rt.PresenceKind_PRESENCE_KIND_JOIN},
		{ActorId: "actor-2", SessionId: "sess-2", Kind: rt.PresenceKind_PRESENCE_KIND_JOIN},
		{ActorId: "actor-3", SessionId: "sess-3", Kind: rt.PresenceKind_PRESENCE_KIND_JOIN},
	}
	for _, a := range actors {
		require.NoError(t, store.Set(ctx, "deck-multi", a))
	}

	got, err := store.GetAll(ctx, "deck-multi")
	require.NoError(t, err)
	assert.Len(t, got, 3)
}

func TestRedisPresence_Expire(t *testing.T) {
	rdb := connectRedis(t)
	if rdb == nil {
		return
	}
	defer rdb.Close()

	store := NewRedisPresence(rdb)
	ctx := context.Background()

	// Set with a very short expiry by using a fresh key and manual expiry
	pres := &rt.Presence{
		ActorId:   "actor-expire",
		SessionId: "sess-expire",
		Kind:      rt.PresenceKind_PRESENCE_KIND_JOIN,
	}

	// First set it normally
	err := store.Set(ctx, "deck-expire", pres)
	require.NoError(t, err)

	// Manually set a very short expiry for testing
	rdb.Expire(ctx, "deck:deck-expire:presence", 1*time.Second)

	// Should exist now
	got, err := store.Get(ctx, "deck-expire", "actor-expire")
	require.NoError(t, err)
	assert.NotNil(t, got)

	// Wait for expiry
	time.Sleep(1100 * time.Millisecond)

	// Should be gone
	got, err = store.Get(ctx, "deck-expire", "actor-expire")
	require.NoError(t, err)
	assert.Nil(t, got)
}
