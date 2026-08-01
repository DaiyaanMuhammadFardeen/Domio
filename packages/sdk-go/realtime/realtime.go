// Package realtime provides a Go client for the Domio realtime gateway.
//
// It implements the WebSocket sync protocol defined in
// contracts/proto/domio/realtime/v1/realtime.proto, including the
// length-prefix frame codec, handshake (Hello/Welcome), CRDT op
// submission, and presence receive.
//
// The gateway endpoints are:
//   - wss://rtgw.domio/v1/sync/{deckId}      — CRDT sync
//   - wss://rtgw.domio/v1/presence/{deckId}   — presence channel
//
// Usage:
//
//	c, err := realtime.Connect(ctx, "wss://rtgw.domio/v1/sync/deck-123", realtime.Config{
//	    ActorID:   "01H0ABCDEF0123456789ABCDEF",
//	    DeckID:    "deck-123",
//	    BranchID:  "main",
//	    SessionID: "session-abc",
//	    Token:     "jwt-token-here",
//	})
//	if err != nil { log.Fatal(err) }
//	defer c.Close()
//
//	go func() {
//	    for {
//	        frame, err := c.ReadFrame()
//	        if err != nil { return }
//	        log.Printf("received: %T", frame)
//	    }
//	}()
//
//	err = c.SendOp(realtime.OpFrame{
//	    OpID:     "01H0ABCDEF0123456789ABCDEF",
//	    DeckID:   "deck-123",
//	    BranchID: "main",
//	    SlideID:  "slide-intro",
//	    AuthorID: "01H0ABCDEF0123456789ABCDEF",
//	    Payload:  yjsUpdateBytes,
//	    OpType:   "yjs_update",
//	})
package realtime

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"

	rtproto "github.com/domio/platform/gen/go/domio/realtime/v1"
)

// ---------------------------------------------------------------------------
// Frame types
// ---------------------------------------------------------------------------

// FrameType identifies the kind of a decoded WebSocket frame.
type FrameType int

const (
	FrameUnknown      FrameType = iota
	FrameHello                  // Client -> Server
	FrameWelcome                // Server -> Client
	FrameOp                     // Client -> Server / Server fan-out
	FrameOpAck                  // Server -> Client
	FramePresence               // Client -> Server / Server fan-out
	FramePeerJoined             // Server -> Client
	FramePeerLeft               // Server -> Client
	FrameBranchSwitch           // Server -> Client
	FrameBranchHead             // Server -> Client
	FrameError                  // Server -> Client
)

// Wire type tags for the frame codec.
const (
	wireTypeHello       byte = 0x01
	wireTypeWelcome     byte = 0x02
	wireTypeOp          byte = 0x03
	wireTypeOpAck       byte = 0x04
	wireTypePresence    byte = 0x05
	wireTypePeerJoined  byte = 0x06
	wireTypePeerLeft    byte = 0x07
	wireTypeBranchSwitch byte = 0x08
	wireTypeBranchHead  byte = 0x09
	wireTypeError       byte = 0x0A
)

// Frame is the top-level decoded frame read from the WebSocket.
type Frame interface {
	GetType() FrameType
}

// ---------------------------------------------------------------------------
// Frame payloads
// ---------------------------------------------------------------------------

// HelloFrame is the first frame sent from client to server.
type HelloFrame struct {
	Hello *rtproto.Hello
}

func (f HelloFrame) GetType() FrameType { return FrameHello }

// WelcomeFrame is the server's response after a successful handshake.
type WelcomeFrame struct {
	Welcome *rtproto.Welcome
}

func (f WelcomeFrame) GetType() FrameType { return FrameWelcome }

// OpFrame is a single CRDT operation.
type OpFrame struct {
	OpID        string
	DeckID      string
	BranchID    string
	SlideID     string
	AuthorID    string
	HLC         *rtproto.HLC
	ParentHLC   *rtproto.HLC
	Payload     []byte
	ClientClock int64
	OpType      string
}

func (f OpFrame) GetType() FrameType { return FrameOp }

// ToProto converts an OpFrame to the protobuf Op message.
func (f OpFrame) ToProto() *rtproto.Op {
	op := &rtproto.Op{
		OpId:        f.OpID,
		DeckId:      f.DeckID,
		BranchId:    f.BranchID,
		SlideId:     f.SlideID,
		AuthorId:    f.AuthorID,
		Hlc:         f.HLC,
		ParentHlc:   f.ParentHLC,
		Payload:     f.Payload,
		ClientClock: f.ClientClock,
	}
	switch f.OpType {
	case "checkpoint":
		op.OpType = rtproto.OpType_OP_TYPE_CHECKPOINT
	default:
		op.OpType = rtproto.OpType_OP_TYPE_YJS_UPDATE
	}
	return op
}

// OpFromProto converts a protobuf Op to an OpFrame.
func OpFromProto(op *rtproto.Op) OpFrame {
	f := OpFrame{
		OpID:        op.OpId,
		DeckID:      op.DeckId,
		BranchID:    op.BranchId,
		SlideID:     op.SlideId,
		AuthorID:    op.AuthorId,
		HLC:         op.Hlc,
		ParentHLC:   op.ParentHlc,
		Payload:     op.Payload,
		ClientClock: op.ClientClock,
	}
	switch op.OpType {
	case rtproto.OpType_OP_TYPE_CHECKPOINT:
		f.OpType = "checkpoint"
	default:
		f.OpType = "yjs_update"
	}
	return f
}

// OpAckFrame acknowledges receipt of an Op.
type OpAckFrame struct {
	OpAck *rtproto.OpAck
}

func (f OpAckFrame) GetType() FrameType { return FrameOpAck }

// PresenceFrame carries a presence state update.
type PresenceFrame struct {
	Presence *rtproto.Presence
}

func (f PresenceFrame) GetType() FrameType { return FramePresence }

// PeerJoinedFrame is broadcast when a new actor enters the branch.
type PeerJoinedFrame struct {
	PeerJoined *rtproto.PeerJoined
}

func (f PeerJoinedFrame) GetType() FrameType { return FramePeerJoined }

// PeerLeftFrame is broadcast when an actor disconnects.
type PeerLeftFrame struct {
	PeerLeft *rtproto.PeerLeft
}

func (f PeerLeftFrame) GetType() FrameType { return FramePeerLeft }

// BranchSwitchFrame notifies that an actor moved to a different branch.
type BranchSwitchFrame struct {
	BranchSwitch *rtproto.BranchSwitch
}

func (f BranchSwitchFrame) GetType() FrameType { return FrameBranchSwitch }

// BranchHeadFrame announces the live head for outbound fan-out.
type BranchHeadFrame struct {
	BranchHead *rtproto.BranchHead
}

func (f BranchHeadFrame) GetType() FrameType { return FrameBranchHead }

// ErrorFrame is a realtime-specific error.
type ErrorFrame struct {
	Error *rtproto.Error
}

func (f ErrorFrame) GetType() FrameType { return FrameError }

// ---------------------------------------------------------------------------
// Frame codec — length-prefix + protobuf
// ---------------------------------------------------------------------------

// Wire format: [4-byte big-endian payload length][1-byte type tag][protobuf payload bytes]
//
// The type tag identifies which protobuf message follows. The payload
// length does NOT include the 5-byte header (4 length + 1 tag).

// wireTypeForProto returns the wire type tag for a protobuf message.
func wireTypeForProto(msg proto.Message) (byte, error) {
	switch msg.(type) {
	case *rtproto.Hello:
		return wireTypeHello, nil
	case *rtproto.Welcome:
		return wireTypeWelcome, nil
	case *rtproto.Op:
		return wireTypeOp, nil
	case *rtproto.OpAck:
		return wireTypeOpAck, nil
	case *rtproto.Presence:
		return wireTypePresence, nil
	case *rtproto.PeerJoined:
		return wireTypePeerJoined, nil
	case *rtproto.PeerLeft:
		return wireTypePeerLeft, nil
	case *rtproto.BranchSwitch:
		return wireTypeBranchSwitch, nil
	case *rtproto.BranchHead:
		return wireTypeBranchHead, nil
	case *rtproto.Error:
		return wireTypeError, nil
	default:
		return 0, fmt.Errorf("unknown protobuf message type: %T", msg)
	}
}

// protoForWireType returns a new protobuf message for a wire type tag.
func protoForWireType(tag byte) (proto.Message, error) {
	switch tag {
	case wireTypeHello:
		return &rtproto.Hello{}, nil
	case wireTypeWelcome:
		return &rtproto.Welcome{}, nil
	case wireTypeOp:
		return &rtproto.Op{}, nil
	case wireTypeOpAck:
		return &rtproto.OpAck{}, nil
	case wireTypePresence:
		return &rtproto.Presence{}, nil
	case wireTypePeerJoined:
		return &rtproto.PeerJoined{}, nil
	case wireTypePeerLeft:
		return &rtproto.PeerLeft{}, nil
	case wireTypeBranchSwitch:
		return &rtproto.BranchSwitch{}, nil
	case wireTypeBranchHead:
		return &rtproto.BranchHead{}, nil
	case wireTypeError:
		return &rtproto.Error{}, nil
	default:
		return nil, fmt.Errorf("unknown wire type tag: 0x%02X", tag)
	}
}

// MarshalFrame serializes a protobuf message into the length-prefix wire format.
func MarshalFrame(msg proto.Message) ([]byte, error) {
	tag, err := wireTypeForProto(msg)
	if err != nil {
		return nil, err
	}
	payload, err := proto.Marshal(msg)
	if err != nil {
		return nil, fmt.Errorf("proto.Marshal: %w", err)
	}
	// 4 bytes length + 1 byte tag + payload
	frame := make([]byte, 5+len(payload))
	binary.BigEndian.PutUint32(frame[:4], uint32(len(payload)))
	frame[4] = tag
	copy(frame[5:], payload)
	return frame, nil
}

// UnmarshalFrame reads one length-prefixed frame from r and returns the
// decoded protobuf message.
func UnmarshalFrame(r io.Reader) (Frame, error) {
	// Read 4-byte length prefix
	var length uint32
	if err := binary.Read(r, binary.BigEndian, &length); err != nil {
		return nil, fmt.Errorf("read length: %w", err)
	}
	if length > 16*1024*1024 { // 16 MB safety limit
		return nil, fmt.Errorf("frame too large: %d bytes", length)
	}

	// Read 1-byte type tag
	var tagByte [1]byte
	if _, err := io.ReadFull(r, tagByte[:]); err != nil {
		return nil, fmt.Errorf("read type tag: %w", err)
	}

	// Read payload
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, fmt.Errorf("read payload: %w", err)
	}

	// Decode protobuf
	msg, err := protoForWireType(tagByte[0])
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(payload, msg); err != nil {
		return nil, fmt.Errorf("proto.Unmarshal: %w", err)
	}

	// Wrap in typed frame
	return wrapProtoFrame(msg)
}

// wrapProtoFrame wraps a decoded protobuf message into the appropriate Frame type.
func wrapProtoFrame(msg proto.Message) (Frame, error) {
	switch m := msg.(type) {
	case *rtproto.Hello:
		return HelloFrame{Hello: m}, nil
	case *rtproto.Welcome:
		return WelcomeFrame{Welcome: m}, nil
	case *rtproto.Op:
		return OpFrame(OpFromProto(m)), nil
	case *rtproto.OpAck:
		return OpAckFrame{OpAck: m}, nil
	case *rtproto.Presence:
		return PresenceFrame{Presence: m}, nil
	case *rtproto.PeerJoined:
		return PeerJoinedFrame{PeerJoined: m}, nil
	case *rtproto.PeerLeft:
		return PeerLeftFrame{PeerLeft: m}, nil
	case *rtproto.BranchSwitch:
		return BranchSwitchFrame{BranchSwitch: m}, nil
	case *rtproto.BranchHead:
		return BranchHeadFrame{BranchHead: m}, nil
	case *rtproto.Error:
		return ErrorFrame{Error: m}, nil
	default:
		return nil, fmt.Errorf("unexpected message type: %T", msg)
	}
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// Config holds the parameters for connecting to the realtime gateway.
type Config struct {
	ActorID   string   // Actor (user) identifier — ULID.
	DeckID    string   // Deck to sync.
	BranchID  string   // Branch to join; defaults to "main".
	SessionID string   // Client-generated session identifier.
	Token     string   // Bearer token for authentication.
	Capabilities []string // Capabilities the client supports.
}

// Client is a realtime gateway WebSocket client.
type Client struct {
	conn   *websocket.Conn
	mu     sync.Mutex
	closed bool
}

// Connect establishes a WebSocket connection to the realtime gateway,
// performs the Hello/Welcome handshake, and returns a ready Client.
func Connect(ctx context.Context, url string, cfg Config) (*Client, error) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	header := make(map[string][]string)
	if cfg.Token != "" {
		header["Authorization"] = []string{"Bearer " + cfg.Token}
	}

	conn, _, err := dialer.DialContext(ctx, url, header)
	if err != nil {
		return nil, fmt.Errorf("websocket dial: %w", err)
	}

	c := &Client{conn: conn}

	// Send Hello
	hello := &rtproto.Hello{
		ActorId:      cfg.ActorID,
		DeckId:       cfg.DeckID,
		BranchId:     cfg.BranchID,
		SessionId:    cfg.SessionID,
		Capabilities: cfg.Capabilities,
	}
	if err := c.sendProto(hello); err != nil {
		conn.Close()
		return nil, fmt.Errorf("send hello: %w", err)
	}

	// Read Welcome
	frame, err := c.ReadFrame()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("read welcome: %w", err)
	}
	if _, ok := frame.(WelcomeFrame); !ok {
		conn.Close()
		return nil, fmt.Errorf("expected Welcome, got %T", frame)
	}

	return c, nil
}

// SendOp sends a CRDT operation frame.
func (c *Client) SendOp(op OpFrame) error {
	return c.sendProto(op.ToProto())
}

// SendPresence sends a presence state update frame.
func (c *Client) SendPresence(p *rtproto.Presence) error {
	return c.sendProto(p)
}

// ReadFrame reads the next frame from the WebSocket connection.
func (c *Client) ReadFrame() (Frame, error) {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return nil, fmt.Errorf("client closed")
	}

	// Read a single binary message from WebSocket
	_, data, err := conn.ReadMessage()
	if err != nil {
		return nil, fmt.Errorf("ws read: %w", err)
	}

	// Parse the length-prefix frame from the byte slice
	return UnmarshalFrameBytes(data)
}

// UnmarshalFrameBytes is like UnmarshalFrame but reads from a byte slice.
func UnmarshalFrameBytes(data []byte) (Frame, error) {
	if len(data) < 5 {
		return nil, fmt.Errorf("frame too short: %d bytes", len(data))
	}

	length := binary.BigEndian.Uint32(data[:4])
	tagByte := data[4]

	if int(length)+5 > len(data) {
		return nil, fmt.Errorf("frame truncated: expected %d bytes, got %d", int(length)+5, len(data))
	}

	payload := data[5 : 5+length]

	msg, err := protoForWireType(tagByte)
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(payload, msg); err != nil {
		return nil, fmt.Errorf("proto.Unmarshal: %w", err)
	}

	return wrapProtoFrame(msg)
}

// Close gracefully closes the WebSocket connection.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return nil
	}
	c.closed = true
	return c.conn.Close()
}

// sendProto marshals a protobuf message and writes it as a WebSocket binary message.
func (c *Client) sendProto(msg proto.Message) error {
	data, err := MarshalFrame(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("client closed")
	}
	return c.conn.WriteMessage(websocket.BinaryMessage, data)
}
