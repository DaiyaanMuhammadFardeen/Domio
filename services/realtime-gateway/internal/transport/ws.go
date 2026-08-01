// Package transport provides the WebSocket read/write pumps and gRPC
// client for the realtime gateway.
package transport

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

const (
	// MaxPayloadSize is the maximum inbound WebSocket message size (1 MiB).
	MaxPayloadSize = 1 << 20

	// PingInterval is the interval between WebSocket pings.
	PingInterval = 5 * time.Second

	// PongWait is the time to wait for a pong before closing the connection.
	PongWait = 10 * time.Second

	// WriteWait is the time allowed for a write to complete.
	WriteWait = 10 * time.Second

	// lenPrefixSize is the number of bytes for the big-endian length prefix.
	lenPrefixSize = 4
)

// ─── WebSocket upgrader ─────────────────────────────────────────────

// Upgrader returns a gorilla/websocket upgrader that allows all origins.
func Upgrader() *websocket.Upgrader {
	return &websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}
}

// ─── Message handler callback ───────────────────────────────────────

// MessageHandler is called when a complete protobuf frame is received.
type MessageHandler func(msg proto.Message)

// ─── Read pump ──────────────────────────────────────────────────────

// ReadPump reads binary frames from the WebSocket connection and invokes
// the handler for each deserialised protobuf message.
//
// The read pump runs until the connection is closed or an error occurs.
func ReadPump(ctx context.Context, conn *websocket.Conn, logger *zap.Logger, handler MessageHandler) {
	defer conn.Close()

	conn.SetReadLimit(MaxPayloadSize)
	conn.SetReadDeadline(time.Now().Add(PongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(PongWait))
		return nil
	})

	for {
		_, reader, err := conn.NextReader()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				logger.Info("ws: connection closed normally")
			} else {
				logger.Warn("ws: read error", zap.Error(err))
			}
			return
		}

		// Read length prefix (4 bytes big-endian).
		lenBuf := make([]byte, lenPrefixSize)
		if _, err := io.ReadFull(reader, lenBuf); err != nil {
			logger.Warn("ws: failed to read length prefix", zap.Error(err))
			return
		}
		msgLen := binary.BigEndian.Uint32(lenBuf)

		if msgLen > MaxPayloadSize {
			logger.Warn("ws: message too large", zap.Uint32("len", msgLen))
			return
		}

		msgBuf := make([]byte, msgLen)
		if _, err := io.ReadFull(reader, msgBuf); err != nil {
			logger.Warn("ws: failed to read message body", zap.Error(err))
			return
		}

		// Wrap in a Envelope to determine message type. For now we use
		// a simple oneof-style dispatch based on the first byte.
		// In production the proto would be wrapped; here we unmarshal
		// into each candidate and use the first that succeeds.
		msg := unwrapMessage(msgBuf)
		if msg != nil {
			handler(msg)
		} else {
			logger.Debug("ws: unable to unwrap message")
		}
	}
}

// unwrapMessage attempts to unmarshal the raw bytes into known message types.
// In a real deployment this would use a proto envelope; here we try each type.
func unwrapMessage(data []byte) proto.Message {
	// Try each known type in order of likelihood.
	hello := &rt.Hello{}
	if err := proto.Unmarshal(data, hello); err == nil && hello.GetActorId() != "" {
		return hello
	}
	op := &rt.Op{}
	if err := proto.Unmarshal(data, op); err == nil && op.GetOpId() != "" {
		return op
	}
	presence := &rt.Presence{}
	if err := proto.Unmarshal(data, presence); err == nil && presence.GetActorId() != "" {
		return presence
	}
	branchSwitch := &rt.BranchSwitch{}
	if err := proto.Unmarshal(data, branchSwitch); err == nil && branchSwitch.GetActorId() != "" {
		return branchSwitch
	}
	return nil
}

// ─── Write pump ─────────────────────────────────────────────────────

// WritePump drains the outbound queue and writes length-prefixed protobuf
// frames to the WebSocket connection.
//
// WritePump runs until the connection is closed or ctx is cancelled.
func WritePump(ctx context.Context, conn *websocket.Conn, outCh <-chan []byte, logger *zap.Logger) {
	defer conn.Close()

	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				logger.Debug("ws: ping failed", zap.Error(err))
				return
			}
		case msg, ok := <-outCh:
			if !ok {
				return
			}
			conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if err := writeProtoFrame(conn, msg); err != nil {
				logger.Warn("ws: write failed", zap.Error(err))
				return
			}
		}
	}
}

// WriteProto sends a single protobuf-encoded, length-prefixed frame.
func WriteProto(conn *websocket.Conn, msg proto.Message) error {
	data, err := proto.Marshal(msg)
	if err != nil {
		return err
	}
	return writeProtoFrame(conn, data)
}

func writeProtoFrame(conn *websocket.Conn, data []byte) error {
	lenBuf := make([]byte, lenPrefixSize)
	binary.BigEndian.PutUint32(lenBuf, uint32(len(data)))

	w, err := conn.NextWriter(websocket.BinaryMessage)
	if err != nil {
		return err
	}
	if _, err := w.Write(lenBuf); err != nil {
		w.Close()
		return err
	}
	if _, err := w.Write(data); err != nil {
		w.Close()
		return err
	}
	return w.Close()
}

// ─── Send helper (respects backpressure) ────────────────────────────

// SendProto enqueues a protobuf message to the session's outbound channel.
// Returns false if the channel is full (slow client).
func SendProto(outCh chan<- []byte, msg proto.Message) bool {
	data, err := proto.Marshal(msg)
	if err != nil {
		return false
	}
	select {
	case outCh <- data:
		return true
	default:
		return false
	}
}

// ─── Connection wrapper ─────────────────────────────────────────────

// Conn wraps a websocket.Conn with thread-safe concurrent write access.
type Conn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// NewConn wraps a raw WebSocket connection.
func NewConn(conn *websocket.Conn) *Conn {
	return &Conn{conn: conn}
}

// WriteProto is a concurrency-safe protobuf write.
func (c *Conn) WriteProto(msg proto.Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return WriteProto(c.conn, msg)
}

// Close closes the underlying connection.
func (c *Conn) Close() error {
	return c.conn.Close()
}

// RemoteAddr returns the remote network address.
func (c *Conn) RemoteAddr() net.Addr {
	return c.conn.RemoteAddr()
}

// Underlying returns the raw gorilla connection.
func (c *Conn) Underlying() *websocket.Conn {
	return c.conn
}
