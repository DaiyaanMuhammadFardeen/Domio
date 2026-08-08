// Package topics defines the subject conventions for the participant
// WS gateway. Mirrors services/edge-pubsub/src/topics.ts in Go.
package topics

import (
	"fmt"
	"strings"
)

// Topic names for audience-side pub/sub.
const (
	Participant = "participant"
	Poll        = "poll"
	WordCloud   = "word_cloud"
	QA          = "qa"
	Quiz        = "quiz"
	Reaction    = "reaction"
	Nav         = "nav"
	Sentiment   = "sentiment"
	RaiseHand   = "raise_hand"
	Lifecycle   = "lifecycle"
	Whisper     = "whisper"
)

// For builds a subject for a given session + topic + (optional) shard.
// Examples:
//
//	For("sess-1", Poll, 5)         → "realtime.session.sess-1.poll.shard.5"
//	For("sess-1", Lifecycle, -1)   → "realtime.session.sess-1.lifecycle"
func For(sessionID, topic string, shard int) string {
	if shard < 0 {
		return fmt.Sprintf("realtime.session.%s.%s", sessionID, topic)
	}
	return fmt.Sprintf("realtime.session.%s.%s.shard.%d", sessionID, topic, shard)
}

// ShardFrom extracts the shard index from a topic, or -1 if not present.
func ShardFrom(subject string) int {
	const suffix = ".shard."
	idx := strings.LastIndex(subject, suffix)
	if idx < 0 {
		return -1
	}
	n := 0
	for _, c := range subject[idx+len(suffix):] {
		if c < '0' || c > '9' {
			return -1
		}
		n = n*10 + int(c-'0')
		if n > 1<<20 {
			return -1
		}
	}
	return n
}

// SessionFrom extracts the session id from a topic.
func SessionFrom(subject string) string {
	const prefix = "realtime.session."
	if !strings.HasPrefix(subject, prefix) {
		return ""
	}
	rest := subject[len(prefix):]
	dot := strings.Index(rest, ".")
	if dot < 0 {
		return ""
	}
	return rest[:dot]
}