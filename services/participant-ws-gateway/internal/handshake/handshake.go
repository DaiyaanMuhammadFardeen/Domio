// Package handshake verifies a participant's session_code + signed
// token at WS upgrade time. The token is minted by the participant-
// session service and stored in audience_audit_event (and signed-link-
// token primitives on the TS side).
package handshake

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// Verify validates that a token is well-formed and was minted by a key
// in `peppers` for the (workspace, session_code) pair.
//
// The wire format is:
//
//	v1.<session_code>.<workspace_id>.<nonce>.<expires_ms>.<hmac_hex>
//
// hmac is computed over the string:
//
//	"v1|"+session_code+"|"+workspace_id+"|"+nonce+"|"+expires_ms
func Verify(token string, peppers map[string][]byte) (WorkspaceAndCode, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 6 {
		return WorkspaceAndCode{}, fmt.Errorf("malformed token")
	}
	if parts[0] != "v1" {
		return WorkspaceAndCode{}, fmt.Errorf("unsupported token version")
	}
	code := parts[1]
	workspace := parts[2]
	nonce := parts[3]
	expiresStr := parts[4]
	macHex := parts[5]

	pepper, ok := peppers[workspace]
	if !ok {
		return WorkspaceAndCode{}, errors.New("unknown workspace")
	}
	mac, err := hex.DecodeString(macHex)
	if err != nil {
		return WorkspaceAndCode{}, fmt.Errorf("malformed mac")
	}
	macStr := "v1|" + code + "|" + workspace + "|" + nonce + "|" + expiresStr
	expected := hmac.New(sha256.New, pepper)
	expected.Write([]byte(macStr))
	if !hmac.Equal(expected.Sum(nil), mac) {
		return WorkspaceAndCode{}, errors.New("bad signature")
	}
	return WorkspaceAndCode{WorkspaceID: workspace, SessionCode: code}, nil
}

// Mint produces a token for a (workspace, session_code) pair. Used
// during tests and by the participant-session service.
func Mint(workspace, code string, expiresMs int64, pepper []byte) string {
	nonce := "n" // deterministic for tests
	expiresStr := fmt.Sprintf("%d", expiresMs)
	macStr := "v1|" + code + "|" + workspace + "|" + nonce + "|" + expiresStr
	mac := hmac.New(sha256.New, pepper)
	mac.Write([]byte(macStr))
	return "v1." + code + "." + workspace + "." + nonce + "." + expiresStr + "." + hex.EncodeToString(mac.Sum(nil))
}

// WorkspaceAndCode is the result of a successful verify.
type WorkspaceAndCode struct {
	WorkspaceID string
	SessionCode string
}