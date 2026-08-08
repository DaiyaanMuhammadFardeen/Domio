package handshake_test

import (
	"strings"
	"testing"

	"github.com/domio/platform/services/participant-ws-gateway/internal/handshake"
)

func TestMintAndVerify_RoundTrip(t *testing.T) {
	pepper := []byte("super-secret-pepper-for-tests")
	token := handshake.Mint("ws-1", "ABC123XY", 1_700_000_000_000, pepper)
	if !strings.HasPrefix(token, "v1.") {
		t.Fatalf("missing v1 prefix: %s", token)
	}
	res, err := handshake.Verify(token, map[string][]byte{"ws-1": pepper})
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if res.WorkspaceID != "ws-1" || res.SessionCode != "ABC123XY" {
		t.Fatalf("decoded wrong: %+v", res)
	}
}

func TestVerify_BadSignature(t *testing.T) {
	pepper := []byte("right")
	token := handshake.Mint("ws-1", "ABC123XY", 1_700_000_000_000, pepper)
	_, err := handshake.Verify(token, map[string][]byte{"ws-1": []byte("wrong")})
	if err == nil {
		t.Fatalf("expected bad signature error")
	}
}

func TestVerify_UnknownWorkspace(t *testing.T) {
	pepper := []byte("x")
	token := handshake.Mint("ws-1", "ABC123XY", 1_700_000_000_000, pepper)
	_, err := handshake.Verify(token, map[string][]byte{"ws-other": pepper})
	if err == nil {
		t.Fatalf("expected unknown workspace error")
	}
}

func TestVerify_Malformed(t *testing.T) {
	cases := []string{"", "v1", "v1.x.y.z.0.deadbeef", "v2.x.y.z.0.deadbeef"}
	for _, c := range cases {
		if _, err := handshake.Verify(c, map[string][]byte{"ws": []byte("x")}); err == nil {
			t.Errorf("expected error for %q", c)
		}
	}
}

func TestVerify_BadHexMac(t *testing.T) {
	token := "v1.ABC123XY.ws-1.n.1700000000000.zzzz"
	_, err := handshake.Verify(token, map[string][]byte{"ws-1": []byte("x")})
	if err == nil {
		t.Fatalf("expected hex parse error")
	}
}