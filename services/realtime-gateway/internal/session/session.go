// Package session manages the lifecycle of WebSocket sessions in the
// realtime gateway.
package session

import (
	"sync"
	"time"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
)

const (
	// MaxInFlight is the maximum number of unacknowledged outbound messages
	// before a slow client is disconnected.
	MaxInFlight = 64

	// SendDeadline is the maximum time to wait when writing to a slow client
	// before closing the connection.
	SendDeadline = 500 * time.Millisecond

	// SendChannelBuffer is the buffer size for the outbound message channel.
	SendChannelBuffer = 128
)

// ─── SessionStore interface ─────────────────────────────────────────

// SessionStore abstracts session persistence for testability.
type SessionStore interface {
	Add(sess *Session)
	Remove(sessionID string)
	GetByDeck(deckID string) []*Session
	GetByDeckBranch(deckID, branchID string) []*Session
	GetByID(sessionID string) (*Session, bool)
	Count() int
}

// ─── MemorySessionStore ─────────────────────────────────────────────

// MemorySessionStore is an in-memory, thread-safe session store.
type MemorySessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

// NewMemorySessionStore returns a new in-memory session store.
func NewMemorySessionStore() *MemorySessionStore {
	return &MemorySessionStore{
		sessions: make(map[string]*Session),
	}
}

func (s *MemorySessionStore) Add(sess *Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[sess.ID] = sess
}

func (s *MemorySessionStore) Remove(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
}

func (s *MemorySessionStore) GetByDeck(deckID string) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Session
	for _, sess := range s.sessions {
		if sess.DeckID == deckID {
			out = append(out, sess)
		}
	}
	return out
}

func (s *MemorySessionStore) GetByDeckBranch(deckID, branchID string) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Session
	for _, sess := range s.sessions {
		if sess.DeckID == deckID && sess.BranchID == branchID {
			out = append(out, sess)
		}
	}
	return out
}

func (s *MemorySessionStore) GetByID(sessionID string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[sessionID]
	return sess, ok
}

func (s *MemorySessionStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.sessions)
}

// ─── Session ────────────────────────────────────────────────────────

// Session represents a single WebSocket connection's state.
type Session struct {
	ID       string
	ActorID  string
	DeckID   string
	BranchID string

	// LiveSessionID is the Phase 16 live-session ID this CRDT session
	// is bound to (set when the deck is being presented live). Empty
	// for offline editing sessions. When set, the gateway re-emits CRDT
	// state applies to NATS subject analytics.ingest.live.{LiveSessionID}
	// so the Phase 17 columnar loader can ingest them.
	LiveSessionID string

	HLC    *rt.HLC // current HLC snapshot (pointer to shared proto)
	OutCh  chan []byte
	Closed chan struct{}

	sendMu sync.Mutex
}

// NewSession creates a new session with allocated channels.
func NewSession(id, actorID, deckID, branchID string, hlc *rt.HLC) *Session {
	if hlc == nil {
		hlc = &rt.HLC{}
	}
	return &Session{
		ID:       id,
		ActorID:  actorID,
		DeckID:   deckID,
		BranchID: branchID,
		HLC:      hlc,
		OutCh:    make(chan []byte, SendChannelBuffer),
		Closed:   make(chan struct{}),
	}
}

// UpdateBranch changes the session's active branch.
func (s *Session) UpdateBranch(newBranchID string) {
	s.BranchID = newBranchID
}

// UpdateHLC updates the session's HLC snapshot.
func (s *Session) UpdateHLC(h *rt.HLC) {
	if h != nil {
		s.HLC = h
	}
}

// BindLiveSessionID pins this CRDT session to a Phase 16 live-session
// for analytics fan-out. Passing an empty string clears the binding.
func (s *Session) BindLiveSessionID(id string) {
	s.LiveSessionID = id
}

// Send enqueues a protobuf-encoded frame for the write pump.
// Returns false if the channel is full (slow client).
func (s *Session) Send(data []byte) bool {
	select {
	case s.OutCh <- data:
		return true
	default:
		return false
	}
}

// Close signals the session is done.
func (s *Session) Close() {
	select {
	case <-s.Closed:
	default:
		close(s.Closed)
	}
}

// IsClosed returns whether the session has been closed.
func (s *Session) IsClosed() bool {
	select {
	case <-s.Closed:
		return true
	default:
		return false
	}
}
