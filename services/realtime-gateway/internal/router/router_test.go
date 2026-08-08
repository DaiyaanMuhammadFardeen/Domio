package router

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	"github.com/domio/platform/services/realtime-gateway/internal/handshake"
	"github.com/domio/platform/services/realtime-gateway/internal/hlc"
	"github.com/domio/platform/services/realtime-gateway/internal/session"
	"github.com/domio/platform/services/realtime-gateway/internal/transport"
)

const testSecret = "test-secret"

// ─── Test helpers ────────────────────────────────────────────────────

// signTestJWT creates an HMAC-SHA256 JWT matching the handshake verifier's format.
func signTestJWT(secret string, claims handshake.Claims) string {
	header := `{"alg":"HS256","typ":"JWT"}`
	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(header))

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		panic(err)
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(headerB64 + "." + payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return headerB64 + "." + payloadB64 + "." + sigB64
}

// readProtoFrame reads a single length-prefixed protobuf frame from a WS connection.
func readProtoFrame(t *testing.T, conn *websocket.Conn) []byte {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, reader, err := conn.NextReader()
	require.NoError(t, err)

	lenBuf := make([]byte, 4)
	_, err = io.ReadFull(reader, lenBuf)
	require.NoError(t, err)
	msgLen := binary.BigEndian.Uint32(lenBuf)
	msgBuf := make([]byte, msgLen)
	_, err = io.ReadFull(reader, msgBuf)
	require.NoError(t, err)
	return msgBuf
}

// decodeWelcome unmarshals a Welcome from raw bytes.
func decodeWelcome(t *testing.T, data []byte) *rt.Welcome {
	t.Helper()
	w := &rt.Welcome{}
	require.NoError(t, proto.Unmarshal(data, w))
	return w
}

// decodeOpAck unmarshals an OpAck from raw bytes.
func decodeOpAck(t *testing.T, data []byte) *rt.OpAck {
	t.Helper()
	a := &rt.OpAck{}
	require.NoError(t, proto.Unmarshal(data, a))
	return a
}

// decodeError unmarshals an Error from raw bytes.
func decodeError(t *testing.T, data []byte) *rt.Error {
	t.Helper()
	e := &rt.Error{}
	require.NoError(t, proto.Unmarshal(data, e))
	return e
}

// newTestRouter creates a router Config with sensible test defaults.
func newTestRouter(t *testing.T) (Config, *httptest.Server) {
	t.Helper()
	logger := zap.NewNop()
	sessStore := session.NewMemorySessionStore()
	clock := hlc.New()
	verifier := handshake.NewVerifier(testSecret, "", logger, clock)

	upgrader := &websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	cfg := Config{
		Logger:    logger,
		Sessions:  sessStore,
		GatewayID: "test-gw",
		Upgrader:  upgrader,
		Verifier:  verifier,
		Clock:     clock,
	}

	r := New(cfg)
	server := httptest.NewServer(r)
	return cfg, server
}

// dialSync connects to the sync endpoint with the given token.
func dialSync(t *testing.T, server *httptest.Server, deckID, token string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") +
		"/v1/sync/" + deckID
	if token != "" {
		wsURL += "?token=" + token
	}
	conn, _, err := websocket.DefaultDialer.DialContext(
		context.Background(), wsURL, nil)
	require.NoError(t, err)
	return conn
}

// sendHello sends a Hello frame over the WebSocket.
func sendHello(t *testing.T, conn *websocket.Conn, actorID, deckID, branchID string) {
	t.Helper()
	hello := &rt.Hello{
		ActorId:  actorID,
		DeckId:   deckID,
		BranchId: branchID,
	}
	err := transport.WriteProto(conn, hello)
	require.NoError(t, err)
}

// ─── Tests ───────────────────────────────────────────────────────────

func TestHandleSyncWS_HelloWelcome(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	conn := dialSync(t, server, "01ARZ3NDEKTSV4RRFFQ69G5FAV", token)
	defer conn.Close()

	// Send Hello
	sendHello(t, conn, "actor-1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")

	// Read Welcome
	data := readProtoFrame(t, conn)
	welcome := decodeWelcome(t, data)

	assert.Equal(t, "test-gw", welcome.GetGatewayId())
	assert.NotNil(t, welcome.GetServerHlc())
	assert.NotZero(t, welcome.GetServerHlc().GetPhysical())
	assert.True(t, welcome.GetPresenceBroadcast())
	assert.Equal(t, uint64(1<<20), welcome.GetMaxPayloadBytes())
	assert.Equal(t, uint32(5000), welcome.GetHeartbeatIntervalMs())
}

func TestHandleSyncWS_OpAck(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	conn := dialSync(t, server, "01ARZ3NDEKTSV4RRFFQ69G5FAV", token)
	defer conn.Close()

	// Complete handshake
	sendHello(t, conn, "actor-1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")
	data := readProtoFrame(t, conn)
	welcome := decodeWelcome(t, data)
	require.NotEmpty(t, welcome.GetGatewayId())

	// Submit an Op
	op := &rt.Op{
		OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		DeckId:   "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		BranchId: "main",
		AuthorId: "actor-1",
		Hlc:      &rt.HLC{Physical: time.Now().UnixNano(), Logical: 1},
		Payload:  []byte("test-yjs-update"),
		OpType:   rt.OpType_OP_TYPE_YJS_UPDATE,
	}
	err := transport.WriteProto(conn, op)
	require.NoError(t, err)

	// Read OpAck
	data = readProtoFrame(t, conn)
	ack := decodeOpAck(t, data)

	assert.Equal(t, "01ARZ3NDEKTSV4RRFFQ69G5FAV", ack.GetOpId())
	assert.True(t, ack.GetApplied())
	assert.NotZero(t, ack.GetServerHlc().GetPhysical())
}

func TestHandleSyncWS_OpValidationReject(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	conn := dialSync(t, server, "01ARZ3NDEKTSV4RRFFQ69G5FAV", token)
	defer conn.Close()

	// Complete handshake
	sendHello(t, conn, "actor-1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")
	readProtoFrame(t, conn) // Welcome

	// Submit an Op with a bad ULID (too short)
	op := &rt.Op{
		OpId:     "BAD_ID",
		DeckId:   "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		BranchId: "main",
		AuthorId: "actor-1",
		Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
		Payload:  []byte("data"),
		OpType:   rt.OpType_OP_TYPE_YJS_UPDATE,
	}
	err := transport.WriteProto(conn, op)
	require.NoError(t, err)

	// Read Error frame
	data := readProtoFrame(t, conn)
	errFrame := decodeError(t, data)

	assert.Equal(t, rt.RealtimeErrorCode_REALTIME_ERROR_CODE_INVALID_OP, errFrame.GetCode())
	assert.Contains(t, errFrame.GetMessage(), "malformed op_id")
	assert.False(t, errFrame.GetRetryable())
}

func TestHandleSyncWS_DeckMismatch(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	conn := dialSync(t, server, "01ARZ3NDEKTSV4RRFFQ69G5FAV", token)
	defer conn.Close()

	// Send Hello with a mismatched deck_id
	hello := &rt.Hello{
		ActorId:  "actor-1",
		DeckId:   "WRONGDECKXXXXXXXXXXXXXXXX", // does not match URL
		BranchId: "main",
	}
	err := transport.WriteProto(conn, hello)
	require.NoError(t, err)

	// Read Error frame
	data := readProtoFrame(t, conn)
	errFrame := decodeError(t, data)

	assert.Equal(t, rt.RealtimeErrorCode_REALTIME_ERROR_CODE_DECK_NOT_FOUND, errFrame.GetCode())
	assert.Contains(t, errFrame.GetMessage(), "deck_id mismatch")
}

func TestHandleSyncWS_NoAuth(t *testing.T) {
	// No verifier → auth is skipped; Hello should still work.
	logger := zap.NewNop()
	sessStore := session.NewMemorySessionStore()
	clock := hlc.New()

	upgrader := &websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	cfg := Config{
		Logger:    logger,
		Sessions:  sessStore,
		GatewayID: "test-gw-noverify",
		Upgrader:  upgrader,
		Verifier:  nil, // no auth
		Clock:     clock,
	}
	r := New(cfg)
	server := httptest.NewServer(r)
	defer server.Close()

	// Connect without token
	conn, _, err := websocket.DefaultDialer.DialContext(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+"/v1/sync/01ARZ3NDEKTSV4RRFFQ69G5FAV",
		nil,
	)
	require.NoError(t, err)
	defer conn.Close()

	// Send Hello — actor_id from Hello should be used directly
	sendHello(t, conn, "actor-1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")

	data := readProtoFrame(t, conn)
	welcome := decodeWelcome(t, data)
	assert.Equal(t, "test-gw-noverify", welcome.GetGatewayId())
}

func TestHandleSyncWS_MissingToken(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	// Connect WITHOUT a token (verifier is configured)
	resp, err := http.Get(server.URL + "/v1/sync/01ARZ3NDEKTSV4RRFFQ69G5FAV")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHandleSyncWS_InvalidToken(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	// Connect with garbage token
	conn, resp, err := websocket.DefaultDialer.DialContext(
		context.Background(),
		"ws"+strings.TrimPrefix(server.URL, "http")+
			"/v1/sync/01ARZ3NDEKTSV4RRFFQ69G5FAV?token=garbage",
		nil,
	)
	if err == nil {
		conn.Close()
	}
	// Either dial fails or we get a non-101 response
	if resp != nil {
		assert.NotEqual(t, http.StatusSwitchingProtocols, resp.StatusCode)
	}
}

func TestHandlePresenceWS_HelloWelcome(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-p1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") +
		"/v1/presence/01ARZ3NDEKTSV4RRFFQ69G5FAV?token=" + token
	conn, _, err := websocket.DefaultDialer.DialContext(
		context.Background(), wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	sendHello(t, conn, "actor-p1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")

	data := readProtoFrame(t, conn)
	welcome := decodeWelcome(t, data)
	assert.Equal(t, "test-gw", welcome.GetGatewayId())
	assert.True(t, welcome.GetPresenceBroadcast())
}

func TestHandlePresenceWS_LocalFanout(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	// Connect two presence clients
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") +
		"/v1/presence/01ARZ3NDEKTSV4RRFFQ69G5FAV?token=" + token

	conn1, _, err := websocket.DefaultDialer.DialContext(context.Background(), wsURL, nil)
	require.NoError(t, err)
	defer conn1.Close()

	conn2, _, err := websocket.DefaultDialer.DialContext(context.Background(), wsURL, nil)
	require.NoError(t, err)
	defer conn2.Close()

	// Complete handshake for both
	for _, conn := range []*websocket.Conn{conn1, conn2} {
		sendHello(t, conn, "actor-1", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "main")
		readProtoFrame(t, conn) // Welcome
	}

	// Send Presence from conn1
	presence := &rt.Presence{
		ActorId:   "actor-1",
		SessionId: "sess-1",
		State:     map[string]string{"cursor": "42,10"},
		Kind:      rt.PresenceKind_PRESENCE_KIND_UPDATE,
	}
	err = transport.WriteProto(conn1, presence)
	require.NoError(t, err)

	// conn2 should receive the presence (fan-out)
	// conn1 should NOT receive it (no echo)
	data := readProtoFrame(t, conn2)
	recvPresence := &rt.Presence{}
	require.NoError(t, proto.Unmarshal(data, recvPresence))
	assert.Equal(t, "actor-1", recvPresence.GetActorId())
	assert.Equal(t, "42,10", recvPresence.GetState()["cursor"])
}

func TestSessionCleanup(t *testing.T) {
	// Build config first so we can inspect the session store.
	logger := zap.NewNop()
	sessStore := session.NewMemorySessionStore()
	clock := hlc.New()
	verifier := handshake.NewVerifier(testSecret, "", logger, clock)

	upgrader := &websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	cfg := Config{
		Logger:    logger,
		Sessions:  sessStore,
		GatewayID: "test-gw",
		Upgrader:  upgrader,
		Verifier:  verifier,
		Clock:     clock,
	}
	r := New(cfg)
	server := httptest.NewServer(r)
	defer server.Close()

	token := signTestJWT(testSecret, handshake.Claims{
		ActorID:     "actor-1",
		DeckID:      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		SessionKind: "interactive",
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	})

	assert.Equal(t, 0, cfg.Sessions.Count())

	conn := dialSync(t, server, "01ARZ3NDEKTSV4RRFFQ69G5FAV", token)

	// Session should be registered
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, 1, cfg.Sessions.Count())

	// Close the connection — session should be cleaned up
	conn.Close()
	time.Sleep(200 * time.Millisecond)
	assert.Equal(t, 0, cfg.Sessions.Count())
}

// ─── Failover role advertisement ────────────────────────────────────

func TestFailoverRoleDefault(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	resp, err := http.Get(server.URL + "/v1/failover")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, 200, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var out map[string]any
	require.NoError(t, json.Unmarshal(body, &out))
	assert.Equal(t, "test-gw", out["gateway_id"])
	assert.Equal(t, "primary", out["role"])
}

func TestFailoverRoleStandby(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	resp, err := http.Get(server.URL + "/v1/failover?mode=standby")
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var out map[string]any
	require.NoError(t, json.Unmarshal(body, &out))
	assert.Equal(t, "standby", out["role"])
}

func TestFailoverRoleInvalidDefaultsToPrimary(t *testing.T) {
	_, server := newTestRouter(t)
	defer server.Close()

	resp, err := http.Get(server.URL + "/v1/failover?mode=banana")
	require.NoError(t, err)
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var out map[string]any
	require.NoError(t, json.Unmarshal(body, &out))
	// Unknown roles currently fall back to primary; future: 400.
	assert.Equal(t, "primary", out["role"])
}
