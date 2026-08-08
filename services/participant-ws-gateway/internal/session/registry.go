// Package session is the in-memory participant registry for the WS
// gateway. One Session = one (session_code, shard_index). The registry
// is sharded by session_code and indexed by participant_id.
package session

import (
	"errors"
	"sync"
	"time"
)

// Participant is the per-connection record.
type Participant struct {
	ID            string
	WorkspaceID   string
	SessionCode   string
	SessionID     string
	ShardIndex    int
	JoinedAt      time.Time
	LastSeenAt    time.Time
	State         State
	DisplayName   string
	Locale        string
	Fingerprint   string
}

// State is the participant lifecycle state.
type State string

const (
	StateJoined State = "joined"
	StateActive State = "active"
	StateIdle   State = "idle"
	StateLeft    State = "left"
	StateKicked  State = "kicked"
)

// Registry tracks participants.
type Registry struct {
	mu sync.RWMutex
	// bySession: session_code -> participant_id -> *Participant
	bySession map[string]map[string]*Participant
	// bySessionID: session_id -> participant_id -> *Participant
	bySessionID map[string]map[string]*Participant
}

// New creates an empty registry.
func New() *Registry {
	return &Registry{
		bySession:   map[string]map[string]*Participant{},
		bySessionID: map[string]map[string]*Participant{},
	}
}

// ErrDuplicate indicates a participant is already joined.
var ErrDuplicate = errors.New("participant already joined")

// Add registers a participant. Returns ErrDuplicate if the participant
// is already registered for this session_code.
func (r *Registry) Add(p *Participant) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	bucket := r.bySession[p.SessionCode]
	if _, ok := bucket[p.ID]; ok {
		return ErrDuplicate
	}
	if bucket == nil {
		bucket = map[string]*Participant{}
		r.bySession[p.SessionCode] = bucket
	}
	bucket[p.ID] = p
	if p.SessionID != "" {
		byID := r.bySessionID[p.SessionID]
		if byID == nil {
			byID = map[string]*Participant{}
			r.bySessionID[p.SessionID] = byID
		}
		byID[p.ID] = p
	}
	return nil
}

// Touch updates the participant's last-seen-at and sets state to active.
func (r *Registry) Touch(sessionCode, participantID string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	bucket := r.bySession[sessionCode]
	if bucket == nil {
		return errors.New("participant not found")
	}
	p, ok := bucket[participantID]
	if !ok {
		return errors.New("participant not found")
	}
	p.LastSeenAt = at
	p.State = StateActive
	return nil
}

// Remove evicts a participant. Idempotent.
func (r *Registry) Remove(sessionCode, participantID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	bucket := r.bySession[sessionCode]
	if bucket != nil {
		p := bucket[participantID]
		if p != nil && p.SessionID != "" {
			if idBucket := r.bySessionID[p.SessionID]; idBucket != nil {
				delete(idBucket, participantID)
			}
		}
		delete(bucket, participantID)
		if len(bucket) == 0 {
			delete(r.bySession, sessionCode)
		}
	}
}

// CountForSession returns active+idle participants for a session_code.
func (r *Registry) CountForSession(sessionCode string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bucket := r.bySession[sessionCode]
	if bucket == nil {
		return 0
	}
	n := 0
	for _, p := range bucket {
		if p.State == StateActive || p.State == StateIdle {
			n++
		}
	}
	return n
}

// ShardCounts returns how many participants are connected per shard
// for a given session_code. Used by the /healthz endpoint.
func (r *Registry) ShardCounts(sessionCode string) map[int]int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bucket := r.bySession[sessionCode]
	out := map[int]int{}
	if bucket == nil {
		return out
	}
	for _, p := range bucket {
		if p.State == StateActive || p.State == StateIdle {
			out[p.ShardIndex]++
		}
	}
	return out
}

// Snapshot returns a defensive copy of the participants for a session.
func (r *Registry) Snapshot(sessionCode string) []*Participant {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bucket := r.bySession[sessionCode]
	out := make([]*Participant, 0, len(bucket))
	for _, p := range bucket {
		cp := *p
		out = append(out, &cp)
	}
	return out
}