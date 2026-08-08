package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/domio/platform/services/mcp-server/internal/audit"
	"github.com/domio/platform/services/mcp-server/internal/registry"
)

// ---------------------------------------------------------------------------
// Authenticator
// ---------------------------------------------------------------------------

// Authenticator resolves a bearer token to a Principal. Implementations
// typically consult the mcp_session table and check revocation.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (*Principal, error)
}

// StaticAuthenticator is a trivial in-memory Authenticator suitable
// for tests and dev mode. It maps a token directly to a Principal.
type StaticAuthenticator struct {
	Tokens map[string]*Principal
}

// Authenticate implements Authenticator.
func (s *StaticAuthenticator) Authenticate(_ context.Context, token string) (*Principal, error) {
	p, ok := s.Tokens[token]
	if !ok {
		return nil, fmt.Errorf("gateway: unknown token")
	}
	return p, nil
}

// ---------------------------------------------------------------------------
// AuditSink
// ---------------------------------------------------------------------------

// AuditSink persists audit events. The gateway emits one event per
// tool call (started/succeeded/failed). The default implementation
// uses the audit.Chain signer; alternatives include writing directly
// to the agent_audit_event table.
type AuditSink interface {
	Record(ctx context.Context, ev audit.Event) error
}

// ChainAuditSink wraps an audit.Chain to record events. The chain
// signs each event with the active HMAC key; the sink is responsible
// for persisting the resulting row (the gateway calls Record with
// the signed event).
type ChainAuditSink struct {
	Chain *audit.Chain
	// Persist is called with the signed event. It returns nil on
	// successful persistence.
	Persist func(ctx context.Context, ev audit.Event) error
}

// Record implements AuditSink.
func (s *ChainAuditSink) Record(ctx context.Context, ev audit.Event) error {
	if s.Persist == nil {
		return errors.New("gateway: ChainAuditSink has no Persist fn")
	}
	return s.Persist(ctx, ev)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Config wires the gateway together. All fields are required except
// Audit (which defaults to a no-op sink).
type Config struct {
	// Authenticator resolves bearer tokens to Principals.
	Authenticator Authenticator
	// Registry maps method names to handlers.
	Registry *registry.Registry
	// Audit persists audit events. If nil, audit is skipped.
	Audit AuditSink
	// Now is the time source. Defaults to time.Now.
	Now func() time.Time
	// RequestIDHeader is the header used for X-Request-ID propagation.
	RequestIDHeader string
}

// Gateway is the top-level HTTP handler. It dispatches POST /mcp
// to a JSON-RPC handler that resolves the method, asserts capability,
// invokes the tool, and emits audit events.
type Gateway struct {
	cfg Config
}

// New constructs a Gateway.
func New(cfg Config) (*Gateway, error) {
	if cfg.Authenticator == nil {
		return nil, errors.New("gateway: Authenticator is required")
	}
	if cfg.Registry == nil {
		return nil, errors.New("gateway: Registry is required")
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.RequestIDHeader == "" {
		cfg.RequestIDHeader = "X-Request-ID"
	}
	return &Gateway{cfg: cfg}, nil
}

// Router returns an http.Handler with the JSON-RPC POST /mcp route
// and standard middleware (RealIP, Recoverer, RequestID, Logger).
//
// The chi router is reused from the ai-orchestrator pattern so the
// middleware ordering matches the rest of the platform.
func (g *Gateway) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.RequestID)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Heartbeat("/healthz"))

	r.Post("/mcp", g.handleJSONRPC)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	return r
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

func (g *Gateway) handleJSONRPC(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := r.Header.Get(g.cfg.RequestIDHeader)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		g.writeProblem(w, requestID, http.StatusBadRequest, "parse_error", "Parse error", err.Error(), nil)
		return
	}
	defer r.Body.Close()

	env, err := ParseRequest(body)
	if err != nil {
		code := CodeParseError
		if errors.Is(err, ErrInvalidRequest) {
			code = CodeInvalidRequest
		}
		g.writeJSONRPCError(w, requestID, nil, code, err.Error(), nil)
		return
	}

	// Authenticate.
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		g.writeJSONRPCError(w, requestID, env.ID, CodeUnauthorized, "missing bearer token", nil)
		return
	}
	principal, err := g.cfg.Authenticator.Authenticate(ctx, token)
	if err != nil {
		g.writeJSONRPCError(w, requestID, env.ID, CodeUnauthorized, "invalid bearer token", nil)
		return
	}
	ctx = WithPrincipal(ctx, principal)
	r = r.WithContext(ctx)

	// Dispatch.
	handler, ok := g.cfg.Registry.Lookup(env.Method)
	if !ok {
		g.writeJSONRPCError(w, requestID, env.ID, CodeMethodNotFound, "method not found", map[string]any{"method": env.Method})
		return
	}

	// Capability check.
	if err := AssertCapability(principal, handler.RequiredScopes...); err != nil {
		var miss *ErrMissingScope
		if errors.As(err, &miss) {
			g.writeJSONRPCError(w, requestID, env.ID, CodeForbidden, "missing required capability", map[string]any{
				"required_scope": string(miss.Scope),
				"principal":      principal.SubjectID,
			})
			return
		}
		g.writeJSONRPCError(w, requestID, env.ID, CodeForbidden, err.Error(), nil)
		return
	}

	// Audit: started.
	if g.cfg.Audit != nil {
		startedEv, err := g.buildAuditEvent(ctx, principal, env, handler.Name, "tool_call.started", nil)
		if err == nil {
			_ = g.cfg.Audit.Record(ctx, startedEv)
		}
	}

	// Execute.
	result, handlerErr := handler.Handle(ctx, env.Params)

	// Audit: completed.
	if g.cfg.Audit != nil {
		eventType := "tool_call.succeeded"
		var payload map[string]any
		if handlerErr != nil {
			eventType = "tool_call.failed"
			payload = map[string]any{"error": handlerErr.Error()}
		}
		doneEv, err := g.buildAuditEvent(ctx, principal, env, handler.Name, eventType, payload)
		if err == nil {
			_ = g.cfg.Audit.Record(ctx, doneEv)
		}
	}

	// Notifications get no response.
	if env.IsNotification() {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if handlerErr != nil {
		g.writeJSONRPCError(w, requestID, env.ID, CodeInternalError, handlerErr.Error(), nil)
		return
	}

	// Success: write JSON-RPC response.
	resp := NewResponse(env.ID, result)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

func (g *Gateway) buildAuditEvent(ctx context.Context, principal *Principal, env Envelope, toolName, eventType string, payload map[string]any) (audit.Event, error) {
	chain, ok := g.cfg.Audit.(*ChainAuditSink)
	if !ok {
		// Without a chain we cannot sign events; return a no-op event.
		return audit.Event{}, errors.New("gateway: audit sink is not a ChainAuditSink")
	}
	chainEv, err := chain.Chain.Build(audit.BuildInput{
		WorkspaceID:    principal.WorkspaceID,
		AgentSessionID: "", // M1: no agent loop yet
		SessionID:      principal.SubjectID,
		EventType:      eventType,
		Payload: mergeAuditPayload(map[string]any{
			"tool":  toolName,
			"jsonrpc_id": string(env.ID),
		}, payload),
	})
	if err != nil {
		return audit.Event{}, err
	}
	return chainEv, nil
}

func mergeAuditPayload(base, extra map[string]any) map[string]any {
	out := make(map[string]any, len(base)+len(extra))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

func (g *Gateway) writeJSONRPCError(w http.ResponseWriter, requestID string, id json.RawMessage, code int, message string, data any) {
	resp := NewErrorResponse(id, code, message, mergeAuditPayload(
		map[string]any{"request_id": requestID},
		nil,
	))
	if data != nil {
		resp.Error.Data, _ = json.Marshal(data)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK) // JSON-RPC errors use HTTP 200
	_ = json.NewEncoder(w).Encode(resp)
}

func (g *Gateway) writeProblem(w http.ResponseWriter, requestID string, status int, code, title, detail string, extras map[string]any) {
	WriteProblem(w, ProblemDetail{
		Status:    status,
		Code:      code,
		Title:     title,
		Detail:    detail,
		RequestID: requestID,
		Extras:    extras,
	})
}

// bearerToken extracts the token from an "Authorization: Bearer …" header.
func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

// ---------------------------------------------------------------------------
// StreamWriter (used by tool handlers that want to emit SSE)
// ---------------------------------------------------------------------------

// StreamWriter lets tool handlers stream SSE events back to the
// caller. The gateway constructs one when the request advertises
// Accept: text/event-stream.
type StreamWriter struct {
	writer *SSEWriter
}

// NewStreamWriter prepares the response for SSE and returns a writer.
// Returns nil if the underlying ResponseWriter does not support flushing.
func NewStreamWriter(w http.ResponseWriter) (*StreamWriter, error) {
	s, err := NewSSEWriter(w)
	if err != nil {
		return nil, err
	}
	return &StreamWriter{writer: s}, nil
}

// Emit writes one SSE event.
func (s *StreamWriter) Emit(event string, data any) error {
	return s.writer.Write(SSEEvent{Event: event, Data: data})
}

// Close marks the writer as closed.
func (s *StreamWriter) Close() {
	s.writer.Close()
}

// Heartbeat runs a heartbeat loop until the context is cancelled.
func (s *StreamWriter) Heartbeat(ctx context.Context, interval time.Duration) error {
	return s.writer.Heartbeat(ctx, interval)
}

// ---------------------------------------------------------------------------
// Internal: bytes.Reader wrapper
// ---------------------------------------------------------------------------

var _ = bytes.NewReader // keep import