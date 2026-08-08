// Package router sets up the chi HTTP router for the realtime gateway.
//
// It handles WebSocket upgrade for the /v1/sync and /v1/presence endpoints,
// performs JWT authentication via query-parameter token, runs the Hello/Welcome
// handshake, and dispatches incoming frames (Op, Presence, BranchSwitch) to
// the appropriate subsystems (NATS bus, session store, local fan-out).
package router

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	"github.com/domio/platform/services/realtime-gateway/internal/bus"
	"github.com/domio/platform/services/realtime-gateway/internal/handshake"
	"github.com/domio/platform/services/realtime-gateway/internal/hlc"
	"github.com/domio/platform/services/realtime-gateway/internal/observability"
	"github.com/domio/platform/services/realtime-gateway/internal/ops"
	"github.com/domio/platform/services/realtime-gateway/internal/session"
	"github.com/domio/platform/services/realtime-gateway/internal/transport"
)

// Config holds the dependencies for the router.
type Config struct {
	Logger    *zap.Logger
	Sessions  session.SessionStore
	GatewayID string
	Upgrader  *websocket.Upgrader

	// Realtime dependencies wired from main.go.
	Bus      *bus.Bus          // NATS JetStream bus; nil disables pub/sub.
	Verifier *handshake.Verifier // JWT verifier; nil disables auth.
	DB       *pgxpool.Pool    // Postgres pool for op dedup; nil accepts all ops.
	Clock    *hlc.Clock       // Shared Hybrid Logical Clock.
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

	// Failover role advertisement. Query parameters:
	//   ?mode=primary   — accepts writes; rejects stale-epoch.
	//   ?mode=standby   — buffers writes for replay on promotion.
	//   ?mode=disabled  — read-only / draining.
	r.Get("/v1/failover", func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		switch mode {
		case "primary", "standby", "disabled":
			// accepted
		default:
			mode = "primary"
		}
		observability.SetFailoverRole(mode)
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"gateway_id": cfg.GatewayID,
			"role":       mode,
		})
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

// ─── Sync WebSocket handler ──────────────────────────────────────────

func handleSyncWS(w http.ResponseWriter, r *http.Request, cfg Config) {
	deckID := chi.URLParam(r, "deckId")

	// Authenticate via JWT query-parameter token.
	// Adaptation note: the proto Hello message has no token field, so the
	// JWT is passed as a ?token= query parameter during the WS upgrade.
	var claims *handshake.Claims
	if cfg.Verifier != nil {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "token required", http.StatusUnauthorized)
			return
		}
		var err error
		claims, err = cfg.Verifier.Verify(r.Context(), token)
		if err != nil {
			cfg.Logger.Warn("auth: JWT verification failed", zap.Error(err))
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	conn, err := cfg.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		cfg.Logger.Warn("ws upgrade failed", zap.Error(err))
		return
	}

	sess := session.NewSession(
		generateSessionID(),
		"", // actor_id is set during the Hello handshake.
		deckID,
		"main",
		&rt.HLC{Physical: 0, Logical: 0},
	)
	cfg.Sessions.Add(sess)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	defer func() {
		cfg.Sessions.Remove(sess.ID)
		cfg.Logger.Info("ws: sync connection closed",
			zap.String("session_id", sess.ID),
			zap.String("deck_id", sess.DeckID),
			zap.String("actor_id", sess.ActorID))
	}()

	go transport.WritePump(ctx, conn, sess.OutCh, cfg.Logger)

	handler := func(msg proto.Message) {
		switch m := msg.(type) {
		case *rt.Hello:
			syncHelloHandler(ctx, m, sess, cfg, claims)
		case *rt.Op:
			syncOpHandler(ctx, m, sess, cfg)
		case *rt.Presence:
			syncPresenceHandler(ctx, m, sess, cfg)
		case *rt.BranchSwitch:
			syncBranchSwitchHandler(ctx, m, sess, cfg)
		default:
			cfg.Logger.Debug("ws: unknown message type received",
				zap.String("session_id", sess.ID))
		}
	}

	transport.ReadPump(ctx, conn, cfg.Logger, handler)
}

// ─── Presence WebSocket handler ──────────────────────────────────────

func handlePresenceWS(w http.ResponseWriter, r *http.Request, cfg Config) {
	deckID := chi.URLParam(r, "deckId")

	// Authenticate via JWT query-parameter token.
	var claims *handshake.Claims
	if cfg.Verifier != nil {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "token required", http.StatusUnauthorized)
			return
		}
		var err error
		claims, err = cfg.Verifier.Verify(r.Context(), token)
		if err != nil {
			cfg.Logger.Warn("auth: JWT verification failed", zap.Error(err))
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

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
	cfg.Sessions.Add(sess)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	defer func() {
		cfg.Sessions.Remove(sess.ID)
		cfg.Logger.Info("ws: presence connection closed",
			zap.String("session_id", sess.ID),
			zap.String("deck_id", sess.DeckID),
			zap.String("actor_id", sess.ActorID))
	}()

	go transport.WritePump(ctx, conn, sess.OutCh, cfg.Logger)

	handler := func(msg proto.Message) {
		switch m := msg.(type) {
		case *rt.Hello:
			syncHelloHandler(ctx, m, sess, cfg, claims)
		case *rt.Presence:
			syncPresenceHandler(ctx, m, sess, cfg)
		default:
			cfg.Logger.Debug("ws: unexpected message type on presence endpoint",
				zap.String("session_id", sess.ID))
		}
	}

	transport.ReadPump(ctx, conn, cfg.Logger, handler)
}

// ─── Per-message handlers ────────────────────────────────────────────

// syncHelloHandler processes a Hello frame from the client. On success it
// authenticates the session, populates actor_id, and sends a Welcome frame.
func syncHelloHandler(ctx context.Context, msg *rt.Hello, sess *session.Session, cfg Config, claims *handshake.Claims) {
	// Validate deck_id matches the URL-provided deck_id.
	if msg.GetDeckId() != "" && msg.GetDeckId() != sess.DeckID {
		transport.SendProto(sess.OutCh, &rt.Error{
			Code:      rt.RealtimeErrorCode_REALTIME_ERROR_CODE_DECK_NOT_FOUND,
			Message:   "deck_id mismatch: Hello.deck_id does not match the URL",
			Retryable: false,
		})
		return
	}

	// Set actor_id from verified JWT claims, or fall back to Hello.actor_id.
	if claims != nil {
		sess.ActorID = claims.ActorID
		// Cross-check that the Hello's actor_id (if supplied) matches the JWT.
		if msg.GetActorId() != "" && msg.GetActorId() != claims.ActorID {
			transport.SendProto(sess.OutCh, &rt.Error{
				Code:      rt.RealtimeErrorCode_REALTIME_ERROR_CODE_UNAUTHORIZED,
				Message:   "actor_id mismatch: Hello.actor_id does not match JWT",
				Retryable: false,
			})
			return
		}
	} else if msg.GetActorId() != "" {
		sess.ActorID = msg.GetActorId()
	}

	// Update session branch if the client specified one.
	if msg.GetBranchId() != "" {
		sess.UpdateBranch(msg.GetBranchId())
	}

	// Build and send Welcome.
	serverHLC := cfg.Clock.Now()
	sess.UpdateHLC(serverHLC)

	welcome := &rt.Welcome{
		GatewayId:           cfg.GatewayID,
		ServerHlc:           serverHLC,
		HeartbeatIntervalMs: 5000,
		PresenceBroadcast:   true,
		MaxPayloadBytes:     1 << 20, // 1 MiB
	}
	transport.SendProto(sess.OutCh, welcome)

	cfg.Logger.Info("hello: handshake complete",
		zap.String("session_id", sess.ID),
		zap.String("actor_id", sess.ActorID),
		zap.String("deck_id", sess.DeckID),
		zap.String("branch_id", sess.BranchID))
}

// syncOpHandler processes a CRDT Op frame. It validates the op, performs
// idempotent insert, publishes to NATS, and sends an OpAck (or Error) back.
func syncOpHandler(ctx context.Context, msg *rt.Op, sess *session.Session, cfg Config) {
	applied, storedAck, err := ops.ValidateAndCheckDuplicate(ctx, cfg.DB, msg, sess.DeckID)
	if err != nil {
		if err == ops.ErrDuplicateOp && storedAck != nil {
			// Duplicate — resend the stored ack for idempotency.
			transport.SendProto(sess.OutCh, storedAck)
		} else {
			// Validation error — send error frame.
			transport.SendProto(sess.OutCh, &rt.Error{
				Code:      rt.RealtimeErrorCode_REALTIME_ERROR_CODE_INVALID_OP,
				Message:   err.Error(),
				Retryable: false,
			})
		}
		return
	}

	// Publish to NATS bus (best-effort, non-blocking).
	if cfg.Bus != nil && applied {
		if data, merr := proto.Marshal(msg); merr == nil {
			if perr := cfg.Bus.PublishCRDT(ctx, msg.GetDeckId(), data); perr != nil {
				cfg.Logger.Warn("nats: publish CRDT failed", zap.Error(perr))
			}
			// Phase 17 W0 — re-emit CRDT state apply as a live_session_event
			// to the analytics fan-out subject so the columnar loader can
			// ingest it. Best-effort; never block the realtime path. Only
			// fans out when the CRDT session is bound to a Phase 16
			// live session (i.e. the deck is being presented live).
			if sess.LiveSessionID != "" {
				if env, eerr := buildLiveSessionEvent("crdt_state_apply", sess.LiveSessionID, msg.GetDeckId(), sess.ActorID, data); eerr == nil {
					if perr := cfg.Bus.PublishAnalyticsLive(ctx, sess.LiveSessionID, env); perr != nil {
						cfg.Logger.Warn("nats: publish analytics-live failed", zap.Error(perr))
					}
				} else {
					cfg.Logger.Warn("rtgw: build live_session_event failed", zap.Error(eerr))
				}
			}
		}
	}

	// Send OpAck.
	transport.SendProto(sess.OutCh, &rt.OpAck{
		OpId:      msg.GetOpId(),
		Applied:   applied,
		ServerHlc: cfg.Clock.Now(),
	})
}

// syncPresenceHandler processes a Presence frame. It publishes to NATS for
// cross-gateway fan-out and relays to local sessions on the same deck.
func syncPresenceHandler(ctx context.Context, msg *rt.Presence, sess *session.Session, cfg Config) {
	// Publish to NATS (best-effort).
	if cfg.Bus != nil {
		if data, merr := proto.Marshal(msg); merr == nil {
			if perr := cfg.Bus.PublishPresence(ctx, sess.DeckID, data); perr != nil {
				cfg.Logger.Warn("nats: publish presence failed", zap.Error(perr))
			}
		}
	}

	// Local fan-out to other sessions on the same deck.
	if data, merr := proto.Marshal(msg); merr == nil {
		peers := cfg.Sessions.GetByDeck(sess.DeckID)
		for _, peer := range peers {
			if peer.ID != sess.ID && !peer.IsClosed() {
				if !peer.Send(data) {
					cfg.Logger.Debug("presence: slow peer, skipping",
						zap.String("peer_session_id", peer.ID))
				}
			}
		}
	}
}

// syncBranchSwitchHandler processes a BranchSwitch frame. It updates the
// session's branch and publishes a meta event to NATS.
func syncBranchSwitchHandler(ctx context.Context, msg *rt.BranchSwitch, sess *session.Session, cfg Config) {
	oldBranch := sess.BranchID
	sess.UpdateBranch(msg.GetToBranchId())

	cfg.Logger.Debug("branch switch",
		zap.String("session_id", sess.ID),
		zap.String("from", oldBranch),
		zap.String("to", msg.GetToBranchId()))

	// Publish meta (best-effort).
	if cfg.Bus != nil {
		if data, merr := proto.Marshal(msg); merr == nil {
			if perr := cfg.Bus.PublishMeta(ctx, sess.DeckID, data); perr != nil {
				cfg.Logger.Warn("nats: publish meta failed", zap.Error(perr))
			}
		}
	}
}

func generateSessionID() string {
	return uuid.New().String()
}

// buildLiveSessionEvent wraps a CRDT op (or any other realtime artifact)
// as a Phase 17 live_session_event JSON envelope. The envelope shape
// mirrors contracts/events/ingest/live_session_event.json. The original
// payload is base64-encoded into live_event_data so the columnar loader
// can decode the source bytes after Kafka → ClickHouse hand-off.
//
// Required fields for the schema:
//   live_event_kind, session_id, source_app="rtgw", ingest_topic="events.ingest.raw"
// Optional fields default to safe values (region_pinned="global", forward_compat=true).
func buildLiveSessionEvent(kind, sessionID, deckID, actorID string, payload []byte) ([]byte, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("buildLiveSessionEvent: empty sessionID")
	}
	if kind == "" {
		return nil, fmt.Errorf("buildLiveSessionEvent: empty kind")
	}
	env := map[string]any{
		"live_event_kind":    kind,
		"session_id":         sessionID,
		"deck_id":            deckID,
		"viewer_id_key":      actorID,
		"live_event_data":    base64.StdEncoding.EncodeToString(payload),
		"payload_size_bytes": len(payload),
		"latency_ms":         0,
		"region_pinned":      "global",
		"source_app":         "rtgw",
		"ingest_topic":       "events.ingest.raw",
		"forward_compat":     true,
		"ts_ms":              time.Now().UnixMilli(),
	}
	return json.Marshal(env)
}
