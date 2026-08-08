package topics_test

import (
	"testing"

	"github.com/domio/platform/services/participant-ws-gateway/internal/topics"
)

func TestFor_ShardVariant(t *testing.T) {
	got := topics.For("sess-1", topics.Poll, 5)
	if got != "realtime.session.sess-1.poll.shard.5" {
		t.Fatalf("unexpected topic: %s", got)
	}
}

func TestFor_GlobalTopic(t *testing.T) {
	got := topics.For("sess-1", topics.Lifecycle, -1)
	if got != "realtime.session.sess-1.lifecycle" {
		t.Fatalf("unexpected topic: %s", got)
	}
}

func TestShardFrom(t *testing.T) {
	cases := map[string]int{
		"realtime.session.sess-1.poll.shard.42": 42,
		"realtime.session.sess-1.lifecycle":     -1,
		"":                                       -1,
		"realtime.session.sess-1.poll.shard.0":   0,
	}
	for input, want := range cases {
		if got := topics.ShardFrom(input); got != want {
			t.Errorf("ShardFrom(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestSessionFrom(t *testing.T) {
	cases := map[string]string{
		"realtime.session.sess-1.poll.shard.5": "sess-1",
		"realtime.session.X.lifecycle":          "X",
		"":                                       "",
		"junk":                                    "",
	}
	for input, want := range cases {
		if got := topics.SessionFrom(input); got != want {
			t.Errorf("SessionFrom(%q) = %q, want %q", input, got, want)
		}
	}
}