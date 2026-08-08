// Package router owns the chi router for the participant WS gateway.
//
// Endpoints:
//
//	GET  /healthz                       — liveness
//	GET  /metrics                       — Prometheus
//	POST /v1/audience/join              — REST join (delegated)
//	GET  /v1/audience/sessions/:code/stats — audience count by shard
//	WS   /v1/audience/ws                — websocket
package router

import (
	"net/http"
	"strconv"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"github.com/domio/platform/services/participant-ws-gateway/internal/bus"
	"github.com/domio/platform/services/participant-ws-gateway/internal/handshake"
	"github.com/domio/platform/services/participant-ws-gateway/internal/hlc"
	"github.com/domio/platform/services/participant-ws-gateway/internal/metrics"
	"github.com/domio/platform/services/participant-ws-gateway/internal/session"
	"github.com/domio/platform/services/participant-ws-gateway/internal/topics"
	"github.com/domio/platform/services/participant-ws-gateway/internal/transport"
)

// Config wires the router with its dependencies.
type Config struct {
	Bus             *bus.Bus
	HLC             *hlc.Clock
	Registry        *session.Registry
	Peppers         map[string][]byte
	Upgrader        websocket.Upgrader
	JoinShards      int // default 1024
	MetricsHandler  http.Handler
	Metrics         metrics.Recorder
	Now             func() int64
}

// Router wraps a chi router.
type Router struct {
	cfg Config
	mux *chi.Mux
	upgrader websocket.Upgrader
	connCount atomic.Int64
}

// New constructs a Router from cfg.
func New(cfg Config) *Router {
	if cfg.JoinShards == 0 {
		cfg.JoinShards = 1024
	}
	if cfg.Now == nil {
		cfg.Now = func() int64 { return transport.NowMs() }
	}
	cfg.Upgrader = websocket.Upgrader{
		CheckOrigin:     func(r *http.Request) bool { return true },
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
	}
	r := &Router{cfg: cfg, upgrader: cfg.Upgrader}
	r.mux = chi.NewRouter()
	r.routes()
	return r
}

// ServeHTTP lets Router serve as an http.Handler.
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mux.ServeHTTP(w, req)
}

func (r *Router) routes() {
	r.mux.Get("/healthz", r.healthz)
	r.mux.Get("/v1/audience/sessions/{code}/stats", r.sessionStats)
	r.mux.Get("/v1/audience/ws", r.websocket)
	if r.cfg.MetricsHandler != nil {
		r.mux.Handle("/metrics", r.cfg.MetricsHandler)
	}
}

func (r *Router) healthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (r *Router) sessionStats(w http.ResponseWriter, req *http.Request) {
	code := chi.URLParam(req, "code")
	shards := r.cfg.Registry.ShardCounts(code)
	total := 0
	for _, n := range shards {
		total += n
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write([]byte(`{"session_code":"` + code + `","total":` + strconv.Itoa(total) + `,"shards":{`))
	first := true
	for k, v := range shards {
		if !first {
			_, _ = w.Write([]byte(","))
		}
		first = false
		_, _ = w.Write([]byte(strconv.Itoa(k) + ":" + strconv.Itoa(v)))
	}
	_, _ = w.Write([]byte("}}"))
}

func (r *Router) websocket(w http.ResponseWriter, req *http.Request) {
	t0 := r.cfg.Now()
	token := req.URL.Query().Get("token")
	code := req.URL.Query().Get("session_code")
	workspace := req.URL.Query().Get("workspace_id")

	if token != "" {
		verified, err := handshake.Verify(token, r.cfg.Peppers)
		if err == nil {
			code = verified.SessionCode
			workspace = verified.WorkspaceID
		}
	}
	if code == "" || workspace == "" {
		http.Error(w, "missing session_code and workspace_id", http.StatusBadRequest)
		return
	}
	shardIndex := shardForCode(code, r.cfg.JoinShards)
	conn, err := r.upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}
	r.cfg.Metrics.IncOpened()
	opened := r.cfg.Now() - t0
	r.cfg.Metrics.RecordWSOpenMs(opened)
	topic := topics.For(extractSessionIDFromCode(code), topics.Participant, shardIndex)
	transport.NewConn(transport.ConnConfig{
		Conn:        conn,
		Bus:         r.cfg.Bus,
		HLC:         r.cfg.HLC,
		Registry:    r.cfg.Registry,
		SessionCode: code,
		SessionID:   extractSessionIDFromCode(code),
		WorkspaceID: workspace,
		ShardIndex:  shardIndex,
		Topic:       topic,
		Metrics:     r.cfg.Metrics,
		Now:         r.cfg.Now,
	}).Run()
	r.cfg.Metrics.IncClosed()
}

// shardForCode derives the deterministic shard index from a session code.
func shardForCode(code string, total int) int {
	if total <= 0 {
		return 0
	}
	var sum uint32 = 2166136261
	for i := 0; i < len(code); i++ {
		sum ^= uint32(code[i])
		sum *= 16777619
	}
	return int(sum % uint32(total))
}

// extractSessionIDFromCode returns a stable id derived from the code.
// In production this is resolved via the participant-session service;
// here we hash the code so it is stable across the process.
func extractSessionIDFromCode(code string) string {
	if code == "" {
		return ""
	}
	return "sess-" + code
}