// Package router sets up the chi HTTP router for the realtime gateway.
package router

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"go.uber.org/zap"

	"github.com/domio/platform/services/realtime-gateway/internal/observability"
	"github.com/domio/platform/services/realtime-gateway/internal/session"
	"github.com/domio/platform/services/realtime-gateway/internal/transport"
)

// Config holds the dependencies for the router.
type Config struct {
	Logger     *zap.Logger
	Sessions   session.SessionStore
	GatewayID  string
	Upgrader   *websocket.Upgrader
}

// New creates and returns a configured chi router.
func New(cfg Config) chi.Router {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/healthz"))

	// Health endpoints.
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Metrics endpoint.
	r.Handle("/metrics", observability.MetricsHandler())

	// WebSocket sync endpoint.
	r.Get("/v1/sync/{deckId}", func(w http.ResponseWriter, r *http.Request) {
		handleSyncWS(w, r, cfg)
	})

	// WebSocket presence endpoint.
	r.Get("/v1/presence/{deckId}", func(w http.ResponseWriter, r *http.Request) {
		handlePresenceWS(w, r, cfg)
	})

	return r
}

func handleSyncWS(w http.ResponseWriter, r *http.Request, cfg Config) {
	deckID := chi.URLParam(r, "deckId")

	conn, err := cfg.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		cfg.Logger.Warn("ws upgrade failed", zap.Error(err))
		return
	}

	sess := session.NewSession(
		generateSessionID(),
		"", // actor_id set during handshake
		deckID,
		"main",
		&rt.HLC{Physical: 0, Logical: 0},
	)

	// Start read/write pumps.
	go transport.WritePump(r.Context(), conn, sess.OutCh, cfg.Logger)

	cfg.Logger.Info("ws: sync connection established",
		zap.String("deck_id", deckID),
		zap.String("session_id", sess.ID))
}

func handlePresenceWS(w http.ResponseWriter, r *http.Request, cfg Config) {
	deckID := chi.URLParam(r, "deckId")

	conn, err := cfg.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		cfg.Logger.Warn("ws upgrade failed", zap.Error(err))
		return
	}

	sess := session.NewSession(
		generateSessionID(),
		"",
		deckID,
		"main",
		&rt.HLC{Physical: 0, Logical: 0},
	)

	go transport.WritePump(r.Context(), conn, sess.OutCh, cfg.Logger)

	cfg.Logger.Info("ws: presence connection established",
		zap.String("deck_id", deckID),
		zap.String("session_id", sess.ID))
}

func generateSessionID() string {
	return uuid.New().String()
}
