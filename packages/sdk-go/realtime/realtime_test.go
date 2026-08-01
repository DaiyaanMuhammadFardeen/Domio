package realtime

import (
	"bytes"
	"testing"

	rtproto "github.com/domio/platform/gen/go/domio/realtime/v1"
	"google.golang.org/protobuf/proto"
)

func TestMarshalUnmarshalFrame_RoundTrip(t *testing.T) {
	tests := []struct {
		name string
		msg  proto.Message
	}{
		{
			name: "Hello",
			msg: &rtproto.Hello{
				ActorId:      "01H0ABCDEF0123456789ABCDEF",
				DeckId:       "deck-123",
				BranchId:     "main",
				SessionId:    "session-abc",
				Capabilities: []string{"sync", "presence"},
			},
		},
		{
			name: "Welcome",
			msg: &rtproto.Welcome{
				GatewayId:            "gw-1",
				HeartbeatIntervalMs:  5000,
				PresenceBroadcast:    true,
				MaxPayloadBytes:      1048576,
			},
		},
		{
			name: "Op",
			msg: &rtproto.Op{
				OpId:        "01H0ABCDEF0123456789ABCDEF",
				DeckId:      "deck-123",
				BranchId:    "main",
				SlideId:     "slide-intro",
				AuthorId:    "01H0ABCDEF0123456789ABCDEF",
				Hlc:         &rtproto.HLC{Physical: 1700000000000000000, Logical: 1},
				ParentHlc:   &rtproto.HLC{Physical: 1700000000000000000, Logical: 0},
				Payload:     []byte{0x01, 0x02, 0x03},
				ClientClock: 42,
				OpType:      rtproto.OpType_OP_TYPE_YJS_UPDATE,
			},
		},
		{
			name: "OpAck",
			msg: &rtproto.OpAck{
				OpId:    "01H0ABCDEF0123456789ABCDEF",
				Applied: true,
				Reason:  "",
				ServerHlc: &rtproto.HLC{Physical: 1700000000000000001, Logical: 0},
			},
		},
		{
			name: "Presence",
			msg: &rtproto.Presence{
				ActorId:   "01H0ABCDEF0123456789ABCDEF",
				SessionId: "session-abc",
				State:     map[string]string{"cursor": "100,200"},
				Hlc:       &rtproto.HLC{Physical: 1700000000000000000, Logical: 5},
				Kind:      rtproto.PresenceKind_PRESENCE_KIND_UPDATE,
			},
		},
		{
			name: "PeerJoined",
			msg: &rtproto.PeerJoined{
				ActorId:   "01H0ABCDEF0123456789ABCDEF",
				SessionId: "session-abc",
				BranchId:  "main",
				Hlc:       &rtproto.HLC{Physical: 1700000000000000000, Logical: 3},
			},
		},
		{
			name: "PeerLeft",
			msg: &rtproto.PeerLeft{
				ActorId:   "01H0ABCDEF0123456789ABCDEF",
				SessionId: "session-abc",
				BranchId:  "main",
				Hlc:       &rtproto.HLC{Physical: 1700000000000000010, Logical: 0},
			},
		},
		{
			name: "BranchSwitch",
			msg: &rtproto.BranchSwitch{
				ActorId:     "01H0ABCDEF0123456789ABCDEF",
				FromBranchId: "main",
				ToBranchId:   "experiment",
				Hlc:          &rtproto.HLC{Physical: 1700000000000000020, Logical: 0},
			},
		},
		{
			name: "BranchHead",
			msg: &rtproto.BranchHead{
				DeckId:   "deck-123",
				BranchId: "main",
				Hlc:      &rtproto.HLC{Physical: 1700000000000000000, Logical: 99},
			},
		},
		{
			name: "Error",
			msg: &rtproto.Error{
				Code:      rtproto.RealtimeErrorCode_REALTIME_ERROR_CODE_RATE_LIMITED,
				Message:   "rate limit exceeded",
				Retryable: true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Marshal
			data, err := MarshalFrame(tt.msg)
			if err != nil {
				t.Fatalf("MarshalFrame: %v", err)
			}

			// Verify wire format: at least 5 bytes header
			if len(data) < 5 {
				t.Fatalf("frame too short: %d bytes", len(data))
			}

			// Unmarshal via io.Reader
			reader := bytes.NewReader(data)
			frame, err := UnmarshalFrame(reader)
			if err != nil {
				t.Fatalf("UnmarshalFrame: %v", err)
			}

			// Verify frame type
			if frame.GetType() == FrameUnknown {
				t.Fatal("decoded frame has unknown type")
			}

			// Unmarshal via byte slice
			frame2, err := UnmarshalFrameBytes(data)
			if err != nil {
				t.Fatalf("UnmarshalFrameBytes: %v", err)
			}
			if frame2.GetType() != frame.GetType() {
				t.Fatalf("frame type mismatch: %v != %v", frame2.GetType(), frame.GetType())
			}
		})
	}
}

func TestMarshalFrame_OpRoundTrip_PreservesAllFields(t *testing.T) {
	original := &rtproto.Op{
		OpId:        "01H0ABCDEF0123456789ABCDEF",
		DeckId:      "deck-456",
		BranchId:    "experiment",
		SlideId:     "slide-chart",
		AuthorId:    "01H0XYZXYZ0123456789ABCDEF",
		Hlc:         &rtproto.HLC{Physical: 1700000000000000000, Logical: 42},
		ParentHlc:   &rtproto.HLC{Physical: 1699999999000000000, Logical: 99},
		Payload:     []byte{0xDE, 0xAD, 0xBE, 0xEF},
		ClientClock: 7,
		OpType:      rtproto.OpType_OP_TYPE_YJS_UPDATE,
	}

	data, err := MarshalFrame(original)
	if err != nil {
		t.Fatalf("MarshalFrame: %v", err)
	}

	frame, err := UnmarshalFrameBytes(data)
	if err != nil {
		t.Fatalf("UnmarshalFrameBytes: %v", err)
	}

	opFrame, ok := frame.(OpFrame)
	if !ok {
		t.Fatalf("expected OpFrame, got %T", frame)
	}

	// Verify all fields survive the round trip
	if opFrame.OpID != original.OpId {
		t.Errorf("OpID = %q, want %q", opFrame.OpID, original.OpId)
	}
	if opFrame.DeckID != original.DeckId {
		t.Errorf("DeckID = %q, want %q", opFrame.DeckID, original.DeckId)
	}
	if opFrame.BranchID != original.BranchId {
		t.Errorf("BranchID = %q, want %q", opFrame.BranchID, original.BranchId)
	}
	if opFrame.SlideID != original.SlideId {
		t.Errorf("SlideID = %q, want %q", opFrame.SlideID, original.SlideId)
	}
	if opFrame.AuthorID != original.AuthorId {
		t.Errorf("AuthorID = %q, want %q", opFrame.AuthorID, original.AuthorId)
	}
	if opFrame.HLC.Physical != original.Hlc.Physical {
		t.Errorf("HLC.Physical = %d, want %d", opFrame.HLC.Physical, original.Hlc.Physical)
	}
	if opFrame.HLC.Logical != original.Hlc.Logical {
		t.Errorf("HLC.Logical = %d, want %d", opFrame.HLC.Logical, original.Hlc.Logical)
	}
	if opFrame.ParentHLC.Physical != original.ParentHlc.Physical {
		t.Errorf("ParentHLC.Physical = %d, want %d", opFrame.ParentHLC.Physical, original.ParentHlc.Physical)
	}
	if !bytes.Equal(opFrame.Payload, original.Payload) {
		t.Errorf("Payload = %v, want %v", opFrame.Payload, original.Payload)
	}
	if opFrame.ClientClock != original.ClientClock {
		t.Errorf("ClientClock = %d, want %d", opFrame.ClientClock, original.ClientClock)
	}
	if opFrame.OpType != "yjs_update" {
		t.Errorf("OpType = %q, want %q", opFrame.OpType, "yjs_update")
	}
}

func TestMarshalFrame_CheckpointOpType(t *testing.T) {
	original := &rtproto.Op{
		OpId:   "01H0ABCDEF0123456789ABCDEF",
		DeckId: "deck-123",
		OpType: rtproto.OpType_OP_TYPE_CHECKPOINT,
		Hlc:    &rtproto.HLC{Physical: 1700000000000000000, Logical: 0},
	}

	data, err := MarshalFrame(original)
	if err != nil {
		t.Fatalf("MarshalFrame: %v", err)
	}

	frame, err := UnmarshalFrameBytes(data)
	if err != nil {
		t.Fatalf("UnmarshalFrameBytes: %v", err)
	}

	opFrame, ok := frame.(OpFrame)
	if !ok {
		t.Fatalf("expected OpFrame, got %T", frame)
	}
	if opFrame.OpType != "checkpoint" {
		t.Errorf("OpType = %q, want %q", opFrame.OpType, "checkpoint")
	}
}

func TestUnmarshalFrame_FrameTooShort(t *testing.T) {
	_, err := UnmarshalFrameBytes([]byte{0x00, 0x01})
	if err == nil {
		t.Fatal("expected error for short frame")
	}
}

func TestUnmarshalFrame_InvalidWireType(t *testing.T) {
	// Build a frame with an unknown type tag
	data := make([]byte, 5)
	data[0] = 0x00 // length = 0
	data[1] = 0x00
	data[2] = 0x00
	data[3] = 0x00
	data[4] = 0xFF // invalid type tag

	_, err := UnmarshalFrameBytes(data)
	if err == nil {
		t.Fatal("expected error for invalid wire type")
	}
}

func TestUnmarshalFrame_TruncatedPayload(t *testing.T) {
	// Claim length=100 but only provide 5 bytes total
	data := make([]byte, 5)
	data[0] = 0x00
	data[1] = 0x00
	data[2] = 0x00
	data[3] = 100
	data[4] = wireTypeOp

	_, err := UnmarshalFrameBytes(data)
	if err == nil {
		t.Fatal("expected error for truncated frame")
	}
}
