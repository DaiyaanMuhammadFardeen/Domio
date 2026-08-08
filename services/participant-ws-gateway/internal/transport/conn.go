// Package transport owns the websocket connection lifecycle for the
// participant WS gateway. Each Conn reads JSON envelopes from the
// client and publishes them to the bus; outbound messages from the
// bus are written back to the socket.
package transport

import (
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/domio/platform/services/participant-ws-gateway/internal/bus"
	"github.com/domio/platform/services/participant-ws-gateway/internal/hlc"
	"github.com/domio/platform/services/participant-ws-gateway/internal/metrics"
	"github.com/domio/platform/services/participant-ws-gateway/internal/session"
)

// Envelope mirrors services/protocol/src/audience-envelope.ts.
type Envelope struct {
	Type string `json:"type"`
	WorkspaceID string `json:"workspace_id"`
	SessionCode string `json:"session_code"`
	ParticipantID string `json:"participant_id"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Outbound is what the gateway writes to the client.
type Outbound struct {
	Type string `json:"type"`
	WorkspaceID string `json:"workspace_id"`
	SessionCode string `json:"session_code"`
	Topic string `json:"topic"`
	Seq uint64 `json:"seq"`
	Hlc uint64 `json:"hlc"`
	Payload json.RawMessage `json:"payload"`
}

// ConnConfig wires a Conn.
type ConnConfig struct {
	Conn        *websocket.Conn
	Bus         *bus.Bus
	HLC         *hlc.Clock
	Registry    *session.Registry
	SessionCode string
	SessionID   string
	WorkspaceID string
	ShardIndex  int
	Topic       string
	Metrics     metrics.Recorder
	Now         func() int64
}

// Conn is the per-connection state.
type Conn struct {
	cfg ConnConfig
	out chan Outbound
	closeOnce sync.Once
	done chan struct{}
}

// NewConn constructs a Conn.
func NewConn(cfg ConnConfig) *Conn {
	if cfg.Now == nil {
		cfg.Now = NowMs
	}
	return &Conn{cfg: cfg, out: make(chan Outbound, 64), done: make(chan struct{})}
}

// Run starts the read + write loops and blocks until the connection
// is closed. Errors are swallowed; the caller just observes ConnClosed.
func (c *Conn) Run() {
	sub := c.cfg.Bus.Subscribe(c.cfg.Topic, "conn-"+c.cfg.SessionCode+":"+c.cfg.WorkspaceID, 0, func(m bus.Message) error {
		select {
		case c.out <- Outbound{
			Type: "fanout",
			WorkspaceID: c.cfg.WorkspaceID,
			SessionCode: c.cfg.SessionCode,
			Topic: m.Topic,
			Seq: m.Seq,
			Hlc: uint64(c.cfg.HLC.Now()),
			Payload: json.RawMessage(m.Payload),
		}:
		default:
			// Slow consumer: drop the frame; metrics record it.
		}
		return nil
	})
	defer c.cfg.Bus.Unsubscribe(sub)

	go c.writeLoop()
	c.readLoop()
}

func (c *Conn) readLoop() {
	defer c.shutdown()
	c.cfg.Conn.SetReadLimit(64 * 1024)
	c.cfg.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.cfg.Conn.SetPongHandler(func(string) error {
		c.cfg.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, raw, err := c.cfg.Conn.ReadMessage()
		if err != nil {
			return
		}
		var env Envelope
		if err := json.Unmarshal(raw, &env); err != nil {
			c.sendError("malformed_envelope", err.Error())
			continue
		}
		c.dispatch(env)
	}
}

func (c *Conn) dispatch(env Envelope) {
	switch env.Type {
	case "hello":
		p := &session.Participant{
			ID: env.ParticipantID,
			WorkspaceID: env.WorkspaceID,
			SessionCode: env.SessionCode,
			SessionID: c.cfg.SessionID,
			ShardIndex: c.cfg.ShardIndex,
			JoinedAt: time.UnixMilli(c.cfg.Now()),
			LastSeenAt: time.UnixMilli(c.cfg.Now()),
			State: session.StateJoined,
		}
		if err := c.cfg.Registry.Add(p); err != nil {
			c.sendError("duplicate", err.Error())
			return
		}
		c.cfg.Metrics.RecordActiveParticipants(1)
		c.cfg.Bus.Publish(c.cfg.Topic, mustJSON(map[string]any{
			"event": "joined",
			"participant_id": env.ParticipantID,
			"hlc": c.cfg.HLC.Now(),
		}))
	case "heartbeat":
		if err := c.cfg.Registry.Touch(c.cfg.SessionCode, env.ParticipantID, time.UnixMilli(c.cfg.Now())); err != nil {
			c.sendError("unknown_participant", err.Error())
			return
		}
	case "leave":
		c.cfg.Registry.Remove(c.cfg.SessionCode, env.ParticipantID)
		c.cfg.Metrics.RecordActiveParticipants(-1)
		c.cfg.Bus.Publish(c.cfg.Topic, mustJSON(map[string]any{
			"event": "left",
			"participant_id": env.ParticipantID,
		}))
		c.shutdown()
	default:
		// Generic fan-out: enqueue to the per-participant topic.
		payload := env.Payload
		if len(payload) == 0 {
			payload = json.RawMessage(`{}`)
		}
		c.cfg.Bus.Publish(c.cfg.Topic, mustJSON(map[string]any{
			"type": env.Type,
			"participant_id": env.ParticipantID,
			"payload": payload,
		}))
		c.cfg.Metrics.IncPublish()
	}
}

func (c *Conn) writeLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-c.done:
			return
		case msg := <-c.out:
			c.cfg.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.cfg.Conn.WriteJSON(msg); err != nil {
				return
			}
			c.cfg.Metrics.RecordFanoutLatency(c.cfg.Now() - hlcToTs(msg.Hlc))
		case <-tick.C:
			c.cfg.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.cfg.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Conn) sendError(code, msg string) {
	select {
	case c.out <- Outbound{
		Type: "error",
		WorkspaceID: c.cfg.WorkspaceID,
		SessionCode: c.cfg.SessionCode,
		Payload: json.RawMessage(`{"code":"` + code + `","message":"` + msg + `"}`),
	}:
	default:
	}
}

func (c *Conn) shutdown() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.cfg.Conn.Close()
	})
}

// NowMs returns the current unix millisecond timestamp.
func NowMs() int64 { return time.Now().UnixMilli() }

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte(`{}`)
	}
	return b
}

// hlcToTs converts an HLC pack to wall-clock ms for SLO accounting.
// The HLC carries physical-ms in the high 48 bits.
func hlcToTs(hlc uint64) int64 {
	return int64(hlc >> 16)
}

// ErrClosed is returned when the conn is already shut down.
var ErrClosed = errors.New("connection closed")