// Package store implements the pgx-backed persistence layer for the
// MCP server. The store handles session, tool_call, idempotency, and
// audit-event persistence. Migration 0040_phase13_mcp.up.sql creates
// the tables this package reads and writes.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/domio/platform/services/mcp-server/internal/audit"
	"github.com/domio/platform/services/mcp-server/internal/auth"
)

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// ErrNotFound is returned when a row is not found.
var ErrNotFound = errors.New("store: not found")

// ErrIdempotencyConflict is returned when an idempotency key has
// already been used with different parameters.
var ErrIdempotencyConflict = errors.New("store: idempotency conflict")

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

// Session is one row of mcp_session.
type Session struct {
	ID           string
	WorkspaceID  string
	PrincipalID  string
	TokenHash    string
	Scopes       []string
	CreatedAt    time.Time
	LastSeenAt   time.Time
	RevokedAt    *time.Time
}

// SessionStore persists Session rows.
type SessionStore interface {
	GetByTokenHash(ctx context.Context, tokenHash string) (*Session, error)
	InsertSession(ctx context.Context, s *Session) error
	Touch(ctx context.Context, id string) error
	Revoke(ctx context.Context, id string) error
}

// ---------------------------------------------------------------------------
// Tool call
// ---------------------------------------------------------------------------

// ToolCall is one row of mcp_tool_call.
type ToolCall struct {
	ID               string
	WorkspaceID      string
	SessionID        string
	ToolName         string
	RequestEnvelope  json.RawMessage
	ResponseEnvelope json.RawMessage
	Status           string
	Error            json.RawMessage
	StartedAt        time.Time
	FinishedAt       *time.Time
	IdempotencyKey   string
	AgentSessionID   string
}

// ToolCallStore persists ToolCall rows.
type ToolCallStore interface {
	InsertToolCall(ctx context.Context, call *ToolCall) error
	UpdateResult(ctx context.Context, id string, response json.RawMessage, status string, errJSON json.RawMessage) error
	GetByID(ctx context.Context, id string) (*ToolCall, error)
	ResolveIdempotent(ctx context.Context, sessionID, idempotencyKey string) (*ToolCall, error)
}

// ---------------------------------------------------------------------------
// AuditEventStore
// ---------------------------------------------------------------------------

// AuditEventStore persists agent_audit_event rows.
type AuditEventStore interface {
	InsertAuditEvent(ctx context.Context, ev *audit.Event) error
}

// ---------------------------------------------------------------------------
// PGX implementation
// ---------------------------------------------------------------------------

// pgxStore is a pgx-backed implementation of SessionStore, ToolCallStore,
// and AuditEventStore. A single *pgxpool.Pool backs all three.
type pgxStore struct {
	pool *pgxpool.Pool
}

// New returns a Store backed by the given pgx pool. The returned value
// implements SessionStore, ToolCallStore, and AuditEventStore.
func New(pool *pgxpool.Pool) Store {
	return &pgxStore{pool: pool}
}

// Store is the combined set of session / tool-call / audit persistence
// methods the gateway needs. Implemented by *pgxStore in production;
// tests can substitute a stub.
type Store interface {
	SessionStore
	ToolCallStore
	AuditEventStore
}

// ---------------------------------------------------------------------------
// Session methods
// ---------------------------------------------------------------------------

func (s *pgxStore) GetByTokenHash(ctx context.Context, tokenHash string) (*Session, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("store: pool not initialized")
	}
	const q = `
		SELECT id, workspace_id::text, principal_id::text, token_hash,
		       scopes, created_at, last_seen_at, revoked_at
		FROM mcp_session WHERE token_hash = $1`
	row := s.pool.QueryRow(ctx, q, tokenHash)
	out := &Session{}
	err := row.Scan(&out.ID, &out.WorkspaceID, &out.PrincipalID, &out.TokenHash,
		&out.Scopes, &out.CreatedAt, &out.LastSeenAt, &out.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("store: GetByTokenHash: %w", err)
	}
	return out, nil
}

func (s *pgxStore) InsertSession(ctx context.Context, sess *Session) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	if sess.ID == "" {
		return errors.New("store: Session.ID is required")
	}
	if sess.WorkspaceID == "" {
		return errors.New("store: Session.WorkspaceID is required")
	}
	if sess.PrincipalID == "" {
		return errors.New("store: Session.PrincipalID is required")
	}
	if sess.TokenHash == "" {
		return errors.New("store: Session.TokenHash is required")
	}
	if sess.Scopes == nil {
		sess.Scopes = []string{}
	}
	if sess.CreatedAt.IsZero() {
		sess.CreatedAt = time.Now().UTC()
	}
	if sess.LastSeenAt.IsZero() {
		sess.LastSeenAt = sess.CreatedAt
	}

	const q = `
		INSERT INTO mcp_session
			(id, workspace_id, principal_id, token_hash, scopes,
			 created_at, last_seen_at)
		VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)`
	_, err := s.pool.Exec(ctx, q,
		sess.ID, sess.WorkspaceID, sess.PrincipalID, sess.TokenHash,
		sess.Scopes, sess.CreatedAt, sess.LastSeenAt)
	if err != nil {
		return fmt.Errorf("store: Insert session: %w", err)
	}
	return nil
}

func (s *pgxStore) Touch(ctx context.Context, id string) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	const q = `UPDATE mcp_session SET last_seen_at = now() WHERE id = $1::uuid`
	_, err := s.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("store: Touch: %w", err)
	}
	return nil
}

func (s *pgxStore) Revoke(ctx context.Context, id string) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	const q = `UPDATE mcp_session SET revoked_at = now() WHERE id = $1::uuid`
	_, err := s.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("store: Revoke: %w", err)
	}
	return nil
}

// PrincipalFromSession converts a Session row into an auth.Principal.
func PrincipalFromSession(s *Session) *auth.Principal {
	scopes := make(map[auth.CapabilityScope]struct{}, len(s.Scopes))
	for _, sc := range s.Scopes {
		scopes[auth.CapabilityScope(sc)] = struct{}{}
	}
	return &auth.Principal{
		SubjectID:   s.PrincipalID,
		WorkspaceID: s.WorkspaceID,
		Scopes:      scopes,
	}
}

// ---------------------------------------------------------------------------
// ToolCall methods
// ---------------------------------------------------------------------------

func (s *pgxStore) InsertToolCall(ctx context.Context, c *ToolCall) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	if c.ID == "" {
		return errors.New("store: ToolCall.ID is required")
	}
	if c.SessionID == "" {
		return errors.New("store: ToolCall.SessionID is required")
	}
	if c.Status == "" {
		c.Status = "running"
	}
	if c.StartedAt.IsZero() {
		c.StartedAt = time.Now().UTC()
	}

	const q = `
		INSERT INTO mcp_tool_call
			(id, workspace_id, session_id, tool_name,
			 request_envelope, status, started_at, idempotency_key, agent_session_id)
		VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, NULLIF($8, ''), NULLIF($9, '')::uuid)`
	_, err := s.pool.Exec(ctx, q,
		c.ID, c.WorkspaceID, c.SessionID, c.ToolName,
		c.RequestEnvelope, c.Status, c.StartedAt, c.IdempotencyKey, c.AgentSessionID)
	if err != nil {
		return fmt.Errorf("store: Insert tool_call: %w", err)
	}
	return nil
}

func (s *pgxStore) UpdateResult(ctx context.Context, id string, response json.RawMessage, status string, errJSON json.RawMessage) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	const q = `
		UPDATE mcp_tool_call
		SET response_envelope = $2,
		    status            = $3,
		    error             = $4,
		    finished_at       = now(),
		    updated_at        = now()
		WHERE id = $1::uuid`
	_, err := s.pool.Exec(ctx, q, id, response, status, errJSON)
	if err != nil {
		return fmt.Errorf("store: UpdateResult: %w", err)
	}
	return nil
}

func (s *pgxStore) GetByID(ctx context.Context, id string) (*ToolCall, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("store: pool not initialized")
	}
	const q = `
		SELECT id, workspace_id::text, session_id::text, tool_name,
		       request_envelope, response_envelope, status, error,
		       started_at, finished_at, idempotency_key, agent_session_id::text
		FROM mcp_tool_call WHERE id = $1::uuid`
	row := s.pool.QueryRow(ctx, q, id)
	out := &ToolCall{}
	err := row.Scan(&out.ID, &out.WorkspaceID, &out.SessionID, &out.ToolName,
		&out.RequestEnvelope, &out.ResponseEnvelope, &out.Status, &out.Error,
		&out.StartedAt, &out.FinishedAt, &out.IdempotencyKey, &out.AgentSessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("store: GetByID: %w", err)
	}
	return out, nil
}

func (s *pgxStore) ResolveIdempotent(ctx context.Context, sessionID, idempotencyKey string) (*ToolCall, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("store: pool not initialized")
	}
	const q = `
		SELECT tc.id, tc.workspace_id::text, tc.session_id::text, tc.tool_name,
		       tc.request_envelope, tc.response_envelope, tc.status, tc.error,
		       tc.started_at, tc.finished_at, tc.idempotency_key, tc.agent_session_id::text
		FROM tool_call_idempotency i
		JOIN mcp_tool_call tc ON tc.id = i.tool_call_id
		WHERE i.session_id = $1::uuid AND i.idempotency_key = $2`
	row := s.pool.QueryRow(ctx, q, sessionID, idempotencyKey)
	out := &ToolCall{}
	err := row.Scan(&out.ID, &out.WorkspaceID, &out.SessionID, &out.ToolName,
		&out.RequestEnvelope, &out.ResponseEnvelope, &out.Status, &out.Error,
		&out.StartedAt, &out.FinishedAt, &out.IdempotencyKey, &out.AgentSessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("store: ResolveIdempotent: %w", err)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// AuditEvent methods
// ---------------------------------------------------------------------------

func (s *pgxStore) InsertAuditEvent(ctx context.Context, ev *audit.Event) error {
	if s == nil || s.pool == nil {
		return errors.New("store: pool not initialized")
	}
	if ev.ID == "" {
		return errors.New("store: audit.Event.ID is required")
	}
	if ev.Hash == "" {
		return errors.New("store: audit.Event.Hash is required")
	}

	payload, err := json.Marshal(ev.Payload)
	if err != nil {
		return fmt.Errorf("store: marshal payload: %w", err)
	}

	const q = `
		INSERT INTO agent_audit_event
			(id, workspace_id, session_id, tool_call_id,
			 agent_session_id, seq, event_type, payload,
			 prev_hash, hash, kid, recorded_at)
		VALUES ($1, $2::uuid, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid,
		        NULLIF($5, '')::uuid, $6, $7, $8,
		        $9, $10, $11, $12)`
	_, err = s.pool.Exec(ctx, q,
		ev.ID, ev.WorkspaceID, ev.SessionID, ev.ToolCallID,
		ev.AgentSessionID, ev.Seq, ev.EventType, payload,
		ev.PrevHash, ev.Hash, ev.Kid, ev.RecordedAt)
	if err != nil {
		return fmt.Errorf("store: InsertAuditEvent: %w", err)
	}
	return nil
}

// Compile-time guard: pgxStore implements Store.
var _ Store = (*pgxStore)(nil)

// ---------------------------------------------------------------------------
// In-memory implementation (dev / test)
// ---------------------------------------------------------------------------

// MemStore is an in-memory implementation of Store. Useful for tests
// and dev mode where no Postgres is available.
type MemStore struct {
	Sessions   map[string]*Session // key: token_hash
	SessionsByID map[string]*Session
	ToolCalls  map[string]*ToolCall
	Idempotency map[string]*ToolCall // key: "<session_id>|<idempotency_key>"
	Audit      []audit.Event
}

// NewMemStore returns an empty MemStore.
func NewMemStore() *MemStore {
	return &MemStore{
		Sessions:     map[string]*Session{},
		SessionsByID: map[string]*Session{},
		ToolCalls:    map[string]*ToolCall{},
		Idempotency:  map[string]*ToolCall{},
	}
}

// ---------------------------------------------------------------------------
// MemStore: SessionStore
// ---------------------------------------------------------------------------

func (m *MemStore) GetByTokenHash(_ context.Context, tokenHash string) (*Session, error) {
	s, ok := m.Sessions[tokenHash]
	if !ok {
		return nil, ErrNotFound
	}
	if s.RevokedAt != nil {
		return nil, ErrNotFound
	}
	return s, nil
}

func (m *MemStore) InsertSession(_ context.Context, s *Session) error {
	if s.ID == "" || s.TokenHash == "" {
		return errors.New("MemStore: Session.ID and TokenHash required")
	}
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now().UTC()
	}
	if s.LastSeenAt.IsZero() {
		s.LastSeenAt = s.CreatedAt
	}
	m.Sessions[s.TokenHash] = s
	m.SessionsByID[s.ID] = s
	return nil
}

func (m *MemStore) Touch(_ context.Context, id string) error {
	s, ok := m.SessionsByID[id]
	if !ok {
		return ErrNotFound
	}
	s.LastSeenAt = time.Now().UTC()
	return nil
}

func (m *MemStore) Revoke(_ context.Context, id string) error {
	s, ok := m.SessionsByID[id]
	if !ok {
		return ErrNotFound
	}
	now := time.Now().UTC()
	s.RevokedAt = &now
	return nil
}

// ---------------------------------------------------------------------------
// MemStore: ToolCallStore
// ---------------------------------------------------------------------------

func (m *MemStore) InsertToolCall(_ context.Context, c *ToolCall) error {
	if c.ID == "" {
		return errors.New("MemStore: ToolCall.ID required")
	}
	if c.Status == "" {
		c.Status = "running"
	}
	if c.StartedAt.IsZero() {
		c.StartedAt = time.Now().UTC()
	}
	m.ToolCalls[c.ID] = c
	if c.IdempotencyKey != "" {
		m.Idempotency[c.SessionID+"|"+c.IdempotencyKey] = c
	}
	return nil
}

func (m *MemStore) UpdateResult(_ context.Context, id string, response json.RawMessage, status string, errJSON json.RawMessage) error {
	c, ok := m.ToolCalls[id]
	if !ok {
		return ErrNotFound
	}
	c.ResponseEnvelope = response
	c.Status = status
	c.Error = errJSON
	now := time.Now().UTC()
	c.FinishedAt = &now
	return nil
}

func (m *MemStore) GetByID(_ context.Context, id string) (*ToolCall, error) {
	c, ok := m.ToolCalls[id]
	if !ok {
		return nil, ErrNotFound
	}
	return c, nil
}

func (m *MemStore) ResolveIdempotent(_ context.Context, sessionID, idempotencyKey string) (*ToolCall, error) {
	c, ok := m.Idempotency[sessionID+"|"+idempotencyKey]
	if !ok {
		return nil, ErrNotFound
	}
	return c, nil
}

// ---------------------------------------------------------------------------
// MemStore: AuditEventStore
// ---------------------------------------------------------------------------

func (m *MemStore) InsertAuditEvent(_ context.Context, ev *audit.Event) error {
	if ev.ID == "" || ev.Hash == "" {
		return errors.New("MemStore: audit.Event.ID and Hash required")
	}
	m.Audit = append(m.Audit, *ev)
	return nil
}