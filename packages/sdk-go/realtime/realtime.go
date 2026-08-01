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
	"net/url"
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

// NOTE: The server gateway (transport/ws.go) does NOT use a wire type tag.
// Wire format is [4-byte big-endian length][protobuf bytes]. Message type
// discrimination is done by field presence on the decoded protobuf,
// mirroring unwrapMessage in the gateway.

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
// Frame codec — length-prefix + protobuf (matches server wire format)
// ---------------------------------------------------------------------------

// Wire format: [4-byte big-endian payload length][protobuf payload bytes]
//
// This matches the server gateway (transport/ws.go). There is NO type tag;
// message type is discriminated by field presence on the decoded protobuf
// bytes, mirroring the server's unwrapMessage function.

// MarshalFrame serializes a protobuf message into the length-prefix wire format:
// [4-byte big-endian payload length][protobuf payload bytes].
//
// This matches the server's framing in transport/ws.go (no type tag).
func MarshalFrame(msg proto.Message) ([]byte, error) {
	payload, err := proto.Marshal(msg)
	if err != nil {
		return nil, fmt.Errorf("proto.Marshal: %w", err)
	}
	frame := make([]byte, 4+len(payload))
	binary.BigEndian.PutUint32(frame[:4], uint32(len(payload)))
	copy(frame[4:], payload)
	return frame, nil
}

// UnmarshalFrame reads one length-prefixed frame from r and returns the
// decoded protobuf message. It discriminates message type by field presence,
// mirroring unwrapMessage in the gateway's transport/ws.go.
func UnmarshalFrame(r io.Reader) (Frame, error) {
	// Read 4-byte length prefix
	var length uint32
	if err := binary.Read(r, binary.BigEndian, &length); err != nil {
		return nil, fmt.Errorf("read length: %w", err)
	}
	if length > 16*1024*1024 { // 16 MB safety limit
		return nil, fmt.Errorf("frame too large: %d bytes", length)
	}

	// Read payload (no type tag — matches server wire format)
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, fmt.Errorf("read payload: %w", err)
	}

	return unwrapMessage(payload)
}

// unwrapMessage attempts to unmarshal raw protobuf bytes into a known message
// type by field presence — exactly mirroring the server's unwrapMessage in
// transport/ws.go, extended for all message types the client receives.
//
// Check order and discriminators:
//   - Op:          op_id (field 1) + hlc (field 6) — unique to Op.
//   - Presence:    actor_id (field 1) + kind (field 5) != UNSPECIFIED.
//   - Hello:       actor_id (field 1) + deck_id (field 2).
//   - BranchSwitch: actor_id (field 1) + to_branch_id (field 3).
//   - Welcome:     gateway_id (field 1) + heartbeat_interval_ms (field 3) > 0.
//   - OpAck:       op_id (field 1) — checked after Welcome to avoid false match.
//   - PeerJoined:  actor_id (field 1) + session_id (field 2) + branch_id (field 3) + hlc (field 4).
//   - PeerLeft:    actor_id (field 1) + session_id (field 2) + branch_id (field 3) + hlc (field 4).
//   - BranchHead:  deck_id (field 1) + branch_id (field 2) + hlc (field 3).
//   - Error:       code (field 1) != UNSPECIFIED.
func unwrapMessage(data []byte) (Frame, error) {
	// Op is checked first — has the unique hlc field (field 6).
	op := &rtproto.Op{}
	if err := proto.Unmarshal(data, op); err == nil &&
		op.GetOpId() != "" && op.GetHlc() != nil {
		return OpFrame(OpFromProto(op)), nil
	}

	// Presence is checked before Hello — field 5 (kind) is an enum (varint)
	// while Hello field 5 is repeated string — different wire types.
	presence := &rtproto.Presence{}
	if err := proto.Unmarshal(data, presence); err == nil &&
		presence.GetActorId() != "" &&
		presence.GetKind() != rtproto.PresenceKind_PRESENCE_KIND_UNSPECIFIED {
		return PresenceFrame{Presence: presence}, nil
	}

	// Hello requires both actor_id and deck_id.
	hello := &rtproto.Hello{}
	if err := proto.Unmarshal(data, hello); err == nil &&
		hello.GetActorId() != "" && hello.GetDeckId() != "" {
		return HelloFrame{Hello: hello}, nil
	}

	// BranchSwitch requires actor_id and to_branch_id.
	branchSwitch := &rtproto.BranchSwitch{}
	if err := proto.Unmarshal(data, branchSwitch); err == nil &&
		branchSwitch.GetActorId() != "" && branchSwitch.GetToBranchId() != "" {
		return BranchSwitchFrame{BranchSwitch: branchSwitch}, nil
	}

	// Welcome requires gateway_id and heartbeat_interval_ms > 0.
	// Checked before OpAck because both have a string at field 1 (gateway_id
	// vs op_id) and would otherwise false-match on field presence alone.
	welcome := &rtproto.Welcome{}
	if err := proto.Unmarshal(data, welcome); err == nil &&
		welcome.GetGatewayId() != "" && welcome.GetHeartbeatIntervalMs() > 0 {
		return WelcomeFrame{Welcome: welcome}, nil
	}

	// OpAck requires op_id (field 1). Checked after Welcome to avoid
	// false-matching a Welcome frame whose gateway_id lands in op_id.
	opAck := &rtproto.OpAck{}
	if err := proto.Unmarshal(data, opAck); err == nil &&
		opAck.GetOpId() != "" {
		return OpAckFrame{OpAck: opAck}, nil
	}

	// PeerJoined requires actor_id, session_id, branch_id, and hlc.
	peerJoined := &rtproto.PeerJoined{}
	if err := proto.Unmarshal(data, peerJoined); err == nil &&
		peerJoined.GetActorId() != "" &&
		peerJoined.GetSessionId() != "" &&
		peerJoined.GetBranchId() != "" &&
		peerJoined.GetHlc() != nil {
		return PeerJoinedFrame{PeerJoined: peerJoined}, nil
	}

	// PeerLeft requires actor_id, session_id, branch_id, and hlc.
	peerLeft := &rtproto.PeerLeft{}
	if err := proto.Unmarshal(data, peerLeft); err == nil &&
		peerLeft.GetActorId() != "" &&
		peerLeft.GetSessionId() != "" &&
		peerLeft.GetBranchId() != "" &&
		peerLeft.GetHlc() != nil {
		return PeerLeftFrame{PeerLeft: peerLeft}, nil
	}

	// BranchHead requires deck_id, branch_id, and hlc.
	branchHead := &rtproto.BranchHead{}
	if err := proto.Unmarshal(data, branchHead); err == nil &&
		branchHead.GetDeckId() != "" &&
		branchHead.GetBranchId() != "" &&
		branchHead.GetHlc() != nil {
		return BranchHeadFrame{BranchHead: branchHead}, nil
	}

	// Error requires code != UNSPECIFIED.
	errMsg := &rtproto.Error{}
	if err := proto.Unmarshal(data, errMsg); err == nil &&
		errMsg.GetCode() != rtproto.RealtimeErrorCode_REALTIME_ERROR_CODE_UNSPECIFIED {
		return ErrorFrame{Error: errMsg}, nil
	}

	return nil, fmt.Errorf("unable to unwrap message from %d bytes", len(data))
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
//
// The gateway authenticates via a ?token= query parameter on the WS upgrade
// request. The Config.Token field is appended to the URL automatically.
func Connect(ctx context.Context, rawURL string, cfg Config) (*Client, error) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	// Append token as query parameter (gateway reads ?token= on upgrade).
	if cfg.Token != "" {
		u, err := url.Parse(rawURL)
		if err != nil {
			return nil, fmt.Errorf("parse url: %w", err)
		}
		q := u.Query()
		q.Set("token", cfg.Token)
		u.RawQuery = q.Encode()
		rawURL = u.String()
	}

	conn, _, err := dialer.DialContext(ctx, rawURL, nil)
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
	if len(data) < 4 {
		return nil, fmt.Errorf("frame too short: %d bytes", len(data))
	}

	length := binary.BigEndian.Uint32(data[:4])

	if int(length)+4 > len(data) {
		return nil, fmt.Errorf("frame truncated: expected %d bytes, got %d", int(length)+4, len(data))
	}

	payload := data[4 : 4+length]
	return unwrapMessage(payload)
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
