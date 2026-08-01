package realtime_test

import (
	"fmt"
	"log"

	rtproto "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/domio/platform/packages/sdk-go/realtime"
)

// This example demonstrates the frame codec round-trip: marshal a
// Hello frame, then unmarshal it back. Wire format is
// [4-byte BE length][protobuf bytes] — matching the server gateway.
func Example_frameCodec() {
	// Build a Hello message
	hello := &rtproto.Hello{
		ActorId:      "01H0ABCDEF0123456789ABCDEF",
		DeckId:       "deck-123",
		BranchId:     "main",
		SessionId:    "session-abc",
		Capabilities: []string{"sync", "presence"},
	}

	// Marshal to wire format
	data, err := realtime.MarshalFrame(hello)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wire frame: %d bytes\n", len(data))

	// Unmarshal from wire format
	frame, err := realtime.UnmarshalFrameBytes(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("frame type: %v\n", frame.GetType())

	// Type assert to HelloFrame
	helloFrame, ok := frame.(realtime.HelloFrame)
	if !ok {
		log.Fatalf("expected HelloFrame, got %T", frame)
	}
	fmt.Printf("actor: %s, deck: %s\n", helloFrame.Hello.ActorId, helloFrame.Hello.DeckId)

	// Output:
	// wire frame: 77 bytes
	// frame type: 1
	// actor: 01H0ABCDEF0123456789ABCDEF, deck: deck-123
}

// This example demonstrates sending a CRDT Op frame.
func Example_sendOp() {
	// Build an OpFrame
	op := realtime.OpFrame{
		OpID:     "01H0ABCDEF0123456789ABCDEF",
		DeckID:   "deck-123",
		BranchID: "main",
		SlideID:  "slide-intro",
		AuthorID: "01H0ABCDEF0123456789ABCDEF",
		HLC:      &rtproto.HLC{Physical: 1700000000000000000, Logical: 1},
		ParentHLC: &rtproto.HLC{Physical: 1700000000000000000, Logical: 0},
		Payload:  []byte{0x01, 0x02, 0x03},
		OpType:   "yjs_update",
	}

	// Convert to protobuf
	protoMsg := op.ToProto()
	fmt.Printf("op type: %v, applied: %v\n", protoMsg.OpType, protoMsg.OpType.String())

	// Output:
	// op type: OP_TYPE_YJS_UPDATE, applied: OP_TYPE_YJS_UPDATE
}
