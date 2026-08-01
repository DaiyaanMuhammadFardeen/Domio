package transport

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

func TestWriteProtoFrame(t *testing.T) {
	// Set up an HTTP server with a WebSocket handler
	server := &websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	var receivedMsgs []proto.Message
	var mu sync.Mutex

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := server.Upgrade(w, r, nil)
		require.NoError(t, err)

		// Read one frame
		_, reader, err := conn.NextReader()
		require.NoError(t, err)

		lenBuf := make([]byte, 4)
		_, err = io.ReadFull(reader, lenBuf)
		require.NoError(t, err)

		msgLen := binary.BigEndian.Uint32(lenBuf)
		msgBuf := make([]byte, msgLen)
		_, err = io.ReadFull(reader, msgBuf)
		require.NoError(t, err)

		hello := &rt.Hello{}
		err = proto.Unmarshal(msgBuf, hello)
		require.NoError(t, err)

		mu.Lock()
		receivedMsgs = append(receivedMsgs, hello)
		mu.Unlock()

		conn.Close()
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer listener.Close()

	go http.Serve(listener, mux)

	// Dial a WebSocket client
	wsURL := "ws://" + listener.Addr().String() + "/ws"
	wsConn, _, err := websocket.DefaultDialer.DialContext(context.Background(), wsURL, nil)
	require.NoError(t, err)
	defer wsConn.Close()

	// Send a Hello message
	hello := &rt.Hello{
		ActorId:  "actor-test",
		DeckId:   "deck-test",
		BranchId: "main",
	}

	err = WriteProto(wsConn, hello)
	require.NoError(t, err)

	// Give server time to receive
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, receivedMsgs, 1)
	received := receivedMsgs[0].(*rt.Hello)
	assert.Equal(t, "actor-test", received.GetActorId())
	assert.Equal(t, "deck-test", received.GetDeckId())
}

func TestWritePumpReadPump(t *testing.T) {
	// Test the full round-trip: two clients connect, one sends an Op, the other receives it.
	server := &websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	// Channel to signal that the second client received a message
	msgReceived := make(chan *rt.Op, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/sync/test-deck", func(w http.ResponseWriter, r *http.Request) {
		conn, err := server.Upgrade(w, r, nil)
		require.NoError(t, err)

		// Read pump: read one message then close
		_, reader, err := conn.NextReader()
		if err != nil {
			return
		}

		lenBuf := make([]byte, 4)
		if _, err := io.ReadFull(reader, lenBuf); err != nil {
			return
		}
		msgLen := binary.BigEndian.Uint32(lenBuf)
		msgBuf := make([]byte, msgLen)
		if _, err := io.ReadFull(reader, msgBuf); err != nil {
			return
		}

		op := &rt.Op{}
		if err := proto.Unmarshal(msgBuf, op); err != nil {
			return
		}
		msgReceived <- op
		conn.Close()
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer listener.Close()
	go http.Serve(listener, mux)

	logger := zap.NewNop()
	wsURL := "ws://" + listener.Addr().String() + "/sync/test-deck"

	// Client 1: sends an Op
	wsConn1, _, err := websocket.DefaultDialer.DialContext(context.Background(), wsURL, nil)
	require.NoError(t, err)

	op := &rt.Op{
		OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		DeckId:   "test-deck",
		BranchId: "main",
		AuthorId: "actor-1",
		Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
		Payload:  []byte("test-data"),
		OpType:   rt.OpType_OP_TYPE_YJS_UPDATE,
	}

	outCh := make(chan []byte, 16)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go WritePump(ctx, wsConn1, outCh, logger)

	// Send via the channel
	data, err := proto.Marshal(op)
	require.NoError(t, err)
	outCh <- data

	// Client 2: receives the Op
	wsConn2, _, err := websocket.DefaultDialer.DialContext(context.Background(), wsURL, nil)
	require.NoError(t, err)
	defer wsConn2.Close()

	// Wait for the message
	select {
	case received := <-msgReceived:
		assert.Equal(t, "01ARZ3NDEKTSV4RRFFQ69G5FAV", received.GetOpId())
		assert.Equal(t, "actor-1", received.GetAuthorId())
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for message")
	}
}

func TestSendProto_Backpressure(t *testing.T) {
	// Test that SendProto returns false when the channel is full.
	outCh := make(chan []byte, 1) // buffer of 1

	// Fill it
	outCh <- []byte("first")

	// Should fail now
	hello := &rt.Hello{ActorId: "test"}
	result := SendProto(outCh, hello)
	assert.False(t, result)
}

func TestUpgrader(t *testing.T) {
	u := Upgrader()
	assert.NotNil(t, u)
	assert.Equal(t, 64*1024, u.ReadBufferSize)
	assert.Equal(t, 64*1024, u.WriteBufferSize)
}
