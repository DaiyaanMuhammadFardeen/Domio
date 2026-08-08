// Package topics builds and validates NATS subject strings for the
// realtime gateway.
package topics

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	// ErrInvalidDeckID is returned when a deck ID contains characters
	// that are not allowed in NATS subjects.
	ErrInvalidDeckID = errors.New("topics: invalid deck ID (must be non-empty, no dots or wildcards)")
)

// ULID-ish: 26 alphanumeric characters (Crockford Base32).
var validDeckID = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

// ValidateDeckID checks that a deck ID is safe for use as a NATS subject
// component (no dots, no wildcards, non-empty, ULID-ish format).
func ValidateDeckID(deckID string) error {
	if deckID == "" {
		return ErrInvalidDeckID
	}
	if strings.ContainsAny(deckID, ".>*") {
		return ErrInvalidDeckID
	}
	if !validDeckID.MatchString(deckID) {
		return ErrInvalidDeckID
	}
	return nil
}

// CRDT returns the NATS subject for CRDT operations on a deck.
func CRDT(deckID string) string {
	return fmt.Sprintf("realtime.deck.%s.crdt", deckID)
}

// Presence returns the NATS subject for presence updates on a deck.
func Presence(deckID string) string {
	return fmt.Sprintf("realtime.deck.%s.presence", deckID)
}

// Meta returns the NATS subject for metadata events on a deck.
func Meta(deckID string) string {
	return fmt.Sprintf("realtime.deck.%s.meta", deckID)
}

// Peer returns an alias for the presence subject (peer events).
func Peer(deckID string) string {
	return Presence(deckID)
}

// AnalyticsLive returns the NATS subject for analytics fan-out from rtgw
// to services/event-ingest. The session ID is the live session ID from
// P15; consumers (event-ingest Kafka bridge + session-archiver) filter
// by `analytics.ingest.live.*`.
func AnalyticsLive(sessionID string) string {
	return fmt.Sprintf("analytics.ingest.live.%s", sessionID)
}

// StreamName is the NATS JetStream stream name for the realtime domain.
const StreamName = "realtime"

// StreamSubjects returns the subject filter patterns the stream subscribes to.
func StreamSubjects() []string {
	return []string{
		"realtime.deck.*.crdt",
		"realtime.deck.*.presence",
		"realtime.deck.*.meta",
		"analytics.ingest.live.*",
	}
}

// DurableConsumerName returns the durable consumer name for a (deck, branch)
// pair.
func DurableConsumerName(deckID, branchID string) string {
	return fmt.Sprintf("rtgw-%s-%s", deckID, branchID)
}
