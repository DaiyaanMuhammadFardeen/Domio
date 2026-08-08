// Package audit implements the hash-chained agent audit log (P13 M1).
//
// The audit log is a per-(workspace_id, agent_session_id) chain of events,
// where each event's `hash` is computed as:
//
//	hash = HMAC-SHA256(server_key, canonical_payload || seq || prev_hash)
//
// `prev_hash` is the previous event's hash. The genesis hash is SHA256("").
// Any tampering, reordering, or deletion of an event in the middle of the
// chain is detectable by re-walking the chain and comparing hashes.
//
// This package is a port of services/prototype-recorder/src/integrity.ts
// (Phase 10 M5). The wire format is identical so that any agent that
// signed an event under the same key can verify it under this Go
// implementation, and vice-versa.
package audit

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

// HMACKeyBytes is the required key length (32 bytes = 256 bits).
const HMACKeyBytes = 32

// RotationOverlap is the default key rotation overlap window (7 days).
const RotationOverlap = 7 * 24 * time.Hour

// KeyHardExpiry is the hard key expiry (90 days).
const KeyHardExpiry = 90 * 24 * time.Hour

// GenesisHash is the prev_hash for the first event in any chain
// (SHA256 of the empty string).
//
// Exposed as a constant so callers can hardcode it in tests and in
// out-of-band verifiers.
var GenesisHash = sha256Hex("")

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// ErrKeyNotFound is returned when the requested kid is not registered.
var ErrKeyNotFound = errors.New("audit: key not found")

// ErrKeyExpired is returned when the requested key is past its expiry.
var ErrKeyExpired = errors.New("audit: key is expired")

// ErrKeyInvalidSize is returned when a key is not 32 bytes hex-encoded.
var ErrKeyInvalidSize = errors.New("audit: key must be 32 bytes hex-encoded")

// ErrSequenceGap is returned when an event's seq is not lastSeq+1.
type ErrSequenceGap struct {
	Expected, Got int64
}

func (e *ErrSequenceGap) Error() string {
	return fmt.Sprintf("audit: sequence gap, expected seq=%d, got seq=%d", e.Expected, e.Got)
}

// ErrChainMismatch is returned when an event's prev_hash does not match
// the previous event's hash.
type ErrChainMismatch struct {
	EventID string
}

func (e *ErrChainMismatch) Error() string {
	return fmt.Sprintf("audit: chain mismatch at event %s", e.EventID)
}

// ErrHashMismatch is returned when a recomputed hash does not match the
// recorded hash.
type ErrHashMismatch struct {
	EventID string
}

func (e *ErrHashMismatch) Error() string {
	return fmt.Sprintf("audit: hash mismatch at event %s", e.EventID)
}

// ErrNoActiveKey is returned when no key is currently eligible for signing.
var ErrNoActiveKey = errors.New("audit: no active HMAC key — operator must rotate")

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

// Key is one HMAC key in the active key set.
type Key struct {
	// Kid is the key identifier — included in each event so that
	// verifiers know which key to use.
	Kid string
	// KeyHex is the 32-byte key, hex-encoded.
	KeyHex string
	// RotatedAt is when the key was activated.
	RotatedAt time.Time
	// ExpiresAt is when the key can no longer be used to sign.
	ExpiresAt time.Time
	// OverlapUntil is when older keys stop being accepted for verify.
	OverlapUntil time.Time
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

// Event is one entry in the audit chain.
type Event struct {
	// ID is a unique identifier for this event (opaque).
	ID string `json:"id"`
	// WorkspaceID identifies the tenant.
	WorkspaceID string `json:"workspace_id"`
	// AgentSessionID groups events into one chain. Empty string means
	// the global chain for that workspace.
	AgentSessionID string `json:"agent_session_id"`
	// SessionID links to the mcp_session that produced the event.
	SessionID string `json:"session_id,omitempty"`
	// ToolCallID links to the mcp_tool_call, if any.
	ToolCallID string `json:"tool_call_id,omitempty"`
	// Seq is the monotonic sequence number within the chain.
	Seq int64 `json:"seq"`
	// EventType is a domain-specific classifier (e.g. "tool_call.started").
	EventType string `json:"event_type"`
	// Payload is the event body — must be JSON-marshalable.
	Payload map[string]any `json:"payload"`
	// PrevHash is the hash of the previous event in the chain.
	PrevHash string `json:"prev_hash"`
	// Hash is the HMAC-SHA256 of (canonical_payload || seq || prev_hash).
	Hash string `json:"hash"`
	// Kid is the key that signed this event.
	Kid string `json:"kid"`
	// RecordedAt is server time when the event was recorded.
	RecordedAt time.Time `json:"recorded_at"`
}

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

// ChainState is the in-memory state of the chain — kept per workspace,
// per agent_session_id.
type ChainState struct {
	// LastSeqByChain maps "<workspace>/<agent_session>" → last seq.
	LastSeqByChain map[string]int64
	// LastHashByChain maps "<workspace>/<agent_session>" → last hash.
	LastHashByChain map[string]string
}

// Chain is the hash-chain signer + verifier.
//
// The chain is goroutine-safe.
type Chain struct {
	mu    sync.Mutex
	keys  map[string]Key
	state ChainState
	now   func() time.Time
	// newID is a test seam for deterministic IDs.
	newID func() string
}

// NewChain returns a new Chain with the given keys loaded. If no keys
// are provided, the chain is initialized with no active key and will
// fail on every signing call.
func NewChain(keys []Key, opts ...ChainOption) (*Chain, error) {
	c := &Chain{
		keys: make(map[string]Key, len(keys)),
		state: ChainState{
			LastSeqByChain: make(map[string]int64),
			LastHashByChain: make(map[string]string),
		},
		now:   time.Now,
		newID: defaultNewID,
	}
	for _, opt := range opts {
		opt(c)
	}
	for _, k := range keys {
		if len(k.KeyHex) != HMACKeyBytes*2 {
			return nil, fmt.Errorf("%w: kid=%s", ErrKeyInvalidSize, k.Kid)
		}
		c.keys[k.Kid] = k
	}
	return c, nil
}

// ChainOption customizes the chain at construction time.
type ChainOption func(*Chain)

// WithClock overrides the time source (used in tests).
func WithClock(now func() time.Time) ChainOption {
	return func(c *Chain) { c.now = now }
}

// WithIDFunc overrides the ID generator (used in tests).
func WithIDFunc(fn func() string) ChainOption {
	return func(c *Chain) { c.newID = fn }
}

// LoadKey inserts a key into the chain (used for late key rotation).
func (c *Chain) LoadKey(k Key) error {
	if len(k.KeyHex) != HMACKeyBytes*2 {
		return fmt.Errorf("%w: kid=%s", ErrKeyInvalidSize, k.Kid)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.keys[k.Kid] = k
	return nil
}

// ActiveKey returns the currently active key for signing. Prefers
// the most-recent key whose OverlapUntil is still in the future,
// falls back to the latest non-expired key.
func (c *Chain) ActiveKey() (Key, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	all := make([]Key, 0, len(c.keys))
	for _, k := range c.keys {
		all = append(all, k)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].RotatedAt.Before(all[j].RotatedAt) })
	var stillActive []Key
	for _, k := range all {
		if k.OverlapUntil.After(now) && k.ExpiresAt.After(now) {
			stillActive = append(stillActive, k)
		}
	}
	if len(stillActive) == 0 {
		for _, k := range all {
			if k.ExpiresAt.After(now) {
				return k, nil
			}
		}
		return Key{}, ErrNoActiveKey
	}
	return stillActive[len(stillActive)-1], nil
}

// RotateKey adds a new key to the key set with the standard 7-day
// overlap and 90-day expiry. The new key is returned.
func (c *Chain) RotateKey(kid string) (Key, error) {
	now := c.now()
	hex, err := generateKeyHex()
	if err != nil {
		return Key{}, err
	}
	k := Key{
		Kid:          kid,
		KeyHex:       hex,
		RotatedAt:    now,
		ExpiresAt:    now.Add(KeyHardExpiry),
		OverlapUntil: now.Add(RotationOverlap),
	}
	if err := c.LoadKey(k); err != nil {
		return Key{}, err
	}
	return k, nil
}

// Hydate restores chain state (used when the service restarts).
func (c *Chain) Hydate(state ChainState) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state = state
}

// Snapshot returns the current chain state (for persistence).
func (c *Chain) Snapshot() ChainState {
	c.mu.Lock()
	defer c.mu.Unlock()
	return ChainState{
		LastSeqByChain:  copyIntMap(c.state.LastSeqByChain),
		LastHashByChain: copyStringMap(c.state.LastHashByChain),
	}
}

// ---------------------------------------------------------------------------
// Build (sign a new event)
// ---------------------------------------------------------------------------

// BuildInput is the input to Build.
type BuildInput struct {
	WorkspaceID    string
	AgentSessionID string
	SessionID      string
	ToolCallID     string
	EventType      string
	Payload        map[string]any
}

// Build constructs a fully-signed event. The returned event is ready
// to be persisted; calling Commit() afterward updates the in-memory
// chain state so the next event can chain off it.
//
// Build holds the chain lock for the entire duration to make
// seq assignment atomic across concurrent goroutines. This is
// important: a naive read-then-write of `lastSeq+1` would lose
// monotonicity under concurrency.
func (c *Chain) Build(in BuildInput) (Event, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	key, err := c.activeKeyLocked()
	if err != nil {
		return Event{}, err
	}

	chainKey := chainKeyOf(in.WorkspaceID, in.AgentSessionID)
	lastSeq := c.state.LastSeqByChain[chainKey]
	lastHash := c.state.LastHashByChain[chainKey]
	if lastHash == "" {
		lastHash = GenesisHash
	}
	seq := lastSeq + 1

	ev := Event{
		ID:             c.newID(),
		WorkspaceID:    in.WorkspaceID,
		AgentSessionID: in.AgentSessionID,
		SessionID:      in.SessionID,
		ToolCallID:     in.ToolCallID,
		Seq:            seq,
		EventType:      in.EventType,
		Payload:        in.Payload,
		PrevHash:       lastHash,
		Kid:            key.Kid,
		RecordedAt:     c.now().UTC(),
	}
	hash, err := computeEventHash(key.KeyHex, in.Payload, seq, lastHash)
	if err != nil {
		return Event{}, err
	}
	ev.Hash = hash

	// Reserve the seq + hash immediately so concurrent Build() calls
	// do not collide. The caller still needs to call Commit() after
	// the event is durably persisted; Commit() simply re-confirms
	// the reservation (idempotent under our keying scheme).
	c.state.LastSeqByChain[chainKey] = seq
	c.state.LastHashByChain[chainKey] = hash

	return ev, nil
}

// Commit is now a no-op kept for API symmetry — Build() already
// reserves the chain position. Commit exists so callers can use a
// two-phase pattern (Build → persist → Commit) without changing
// signatures when we later add a slow path.
func (c *Chain) Commit(ev Event) {
	_ = ev
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

// Verify checks that the event has a valid hash, that the prev_hash
// matches the previous event's hash (if previous is given), and that
// the key is not expired.
//
// Note: Verify does NOT check the monotonic-seq invariant against the
// in-memory chain state. The chain state is updated by Build() and
// serving single-event verification from in-memory state would race
// with concurrent builds. Use VerifyChain() for chain-integrity checks.
func (c *Chain) Verify(ev Event, prevHash string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	key, ok := c.keys[ev.Kid]
	if !ok {
		return fmt.Errorf("%w: kid=%s", ErrKeyNotFound, ev.Kid)
	}
	if !key.ExpiresAt.After(c.now()) {
		return fmt.Errorf("%w: kid=%s", ErrKeyExpired, ev.Kid)
	}
	expected, err := computeEventHash(key.KeyHex, ev.Payload, ev.Seq, ev.PrevHash)
	if err != nil {
		return err
	}
	if expected != ev.Hash {
		return &ErrHashMismatch{EventID: ev.ID}
	}
	if prevHash != "" && ev.PrevHash != prevHash {
		return &ErrChainMismatch{EventID: ev.ID}
	}
	return nil
}

// VerifyChain walks a list of events in order and verifies that they
// form a valid chain. The previous event's hash must match the next
// event's prev_hash, and the recomputed hash must match the recorded
// hash.
func (c *Chain) VerifyChain(events []Event) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	var prevHash string
	for _, ev := range events {
		key, ok := c.keys[ev.Kid]
		if !ok {
			return fmt.Errorf("%w: kid=%s", ErrKeyNotFound, ev.Kid)
		}
		if !key.ExpiresAt.After(c.now()) {
			return fmt.Errorf("%w: kid=%s", ErrKeyExpired, ev.Kid)
		}
		expected, err := computeEventHash(key.KeyHex, ev.Payload, ev.Seq, ev.PrevHash)
		if err != nil {
			return err
		}
		if expected != ev.Hash {
			return &ErrHashMismatch{EventID: ev.ID}
		}
		if prevHash != "" && ev.PrevHash != prevHash {
			return &ErrChainMismatch{EventID: ev.ID}
		}
		prevHash = ev.Hash
	}
	return nil
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

func (c *Chain) activeKeyLocked() (Key, error) {
	now := c.now()
	all := make([]Key, 0, len(c.keys))
	for _, k := range c.keys {
		all = append(all, k)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].RotatedAt.Before(all[j].RotatedAt) })
	var stillActive []Key
	for _, k := range all {
		if k.OverlapUntil.After(now) && k.ExpiresAt.After(now) {
			stillActive = append(stillActive, k)
		}
	}
	if len(stillActive) == 0 {
		for _, k := range all {
			if k.ExpiresAt.After(now) {
				return k, nil
			}
		}
		return Key{}, ErrNoActiveKey
	}
	return stillActive[len(stillActive)-1], nil
}

// computeEventHash is the canonical event-hash function. It is exported
// indirectly via Build() and Verify(), but also available as a package-
// level helper for tests.
func computeEventHash(serverKeyHex string, payload map[string]any, seq int64, prevHash string) (string, error) {
	canonical, err := canonicalizePayload(payload)
	if err != nil {
		return "", err
	}
	msg := canonical + "|seq:" + strconv.FormatInt(seq, 10) + "|prev:" + prevHash
	return hmacHex(serverKeyHex, msg)
}

// canonicalizePayload produces a deterministic string serialization
// of the payload. Keys are sorted lexicographically. This is the
// critical bit — both signer and verifier must produce the same
// bytes from the same logical payload.
func canonicalizePayload(payload map[string]any) (string, error) {
	if payload == nil {
		return "null", nil
	}
	keys := make([]string, 0, len(payload))
	for k := range payload {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		v, err := stableStringify(payload[k])
		if err != nil {
			return "", err
		}
		parts = append(parts, strconvQuote(k)+":"+v)
	}
	return "{" + joinStrings(parts, ",") + "}", nil
}

// stableStringify is a JSON-canonical primitive serializer.
func stableStringify(v any) (string, error) {
	switch x := v.(type) {
	case nil:
		return "null", nil
	case string:
		b, err := json.Marshal(x)
		if err != nil {
			return "", err
		}
		return string(b), nil
	case bool:
		if x {
			return "true", nil
		}
		return "false", nil
	case float64:
		return strconv.FormatFloat(x, 'g', -1, 64), nil
	case int:
		return strconv.FormatInt(int64(x), 10), nil
	case int64:
		return strconv.FormatInt(x, 10), nil
	case []any:
		parts := make([]string, 0, len(x))
		for _, item := range x {
			s, err := stableStringify(item)
			if err != nil {
				return "", err
			}
			parts = append(parts, s)
		}
		return "[" + joinStrings(parts, ",") + "]", nil
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			s, err := stableStringify(x[k])
			if err != nil {
				return "", err
			}
			parts = append(parts, strconvQuote(k)+":"+s)
		}
		return "{" + joinStrings(parts, ",") + "}", nil
	default:
		// Fall back to JSON for unknown types.
		b, err := json.Marshal(v)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
}

// hmacHex returns HMAC-SHA256(key, msg) as hex.
func hmacHex(keyHex, msg string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", err
	}
	h := hmac.New(sha256.New, key)
	h.Write([]byte(msg))
	return hex.EncodeToString(h.Sum(nil)), nil
}

// sha256Hex returns the SHA-256 of msg as hex.
func sha256Hex(msg string) string {
	s := sha256.Sum256([]byte(msg))
	return hex.EncodeToString(s[:])
}

// generateKeyHex returns a new 32-byte HMAC key, hex-encoded.
func generateKeyHex() (string, error) {
	b := make([]byte, HMACKeyBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// defaultNewID is the default event ID generator.
func defaultNewID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// rand.Read on Linux is documented never to fail with a nil
		// buffer; if it does, fall back to a timestamp-based ID.
		return "ae-" + time.Now().UTC().Format("20060102T150405.000000000")
	}
	return "ae-" + hex.EncodeToString(b)
}

// chainKeyOf builds the per-chain map key.
func chainKeyOf(workspaceID, agentSessionID string) string {
	return workspaceID + "/" + agentSessionID
}

// copyIntMap returns a shallow copy of m.
func copyIntMap(m map[string]int64) map[string]int64 {
	out := make(map[string]int64, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// copyStringMap returns a shallow copy of m.
func copyStringMap(m map[string]string) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// strconvQuote is a JSON-style string quoter.
func strconvQuote(s string) string { b, _ := json.Marshal(s); return string(b) }

// joinStrings is strings.Join without the import.
func joinStrings(xs []string, sep string) string {
	if len(xs) == 0 {
		return ""
	}
	out := xs[0]
	for i := 1; i < len(xs); i++ {
		out += sep + xs[i]
	}
	return out
}
