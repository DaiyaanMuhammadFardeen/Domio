// Package gateway implements the MCP server gateway — JSON-RPC 2.0
// framing, RFC-7807-style problem-detail errors, SSE transport, and
// capability gating.
//
// The gateway is HTTP(S)-only. JSON-RPC envelopes are sent over POST
// /mcp and streamed back over text/event-stream when the tool handler
// emits multiple chunks.
package gateway

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelopes
// ---------------------------------------------------------------------------

// Envelope is the JSON-RPC 2.0 request envelope.
type Envelope struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is the JSON-RPC 2.0 response envelope.
//
// `Result` and `Error` are mutually exclusive per the spec.
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError is the JSON-RPC 2.0 error object.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	// Data is an RFC-7807-style problem-detail JSON object (optional).
	Data json.RawMessage `json:"data,omitempty"`
}

// Standard JSON-RPC 2.0 error codes.
const (
	CodeParseError          = -32700 // Invalid JSON
	CodeInvalidRequest      = -32600 // Not a valid Request
	CodeMethodNotFound      = -32601 // Method does not exist
	CodeInvalidParams       = -32602 // Invalid method parameters
	CodeInternalError       = -32603 // Internal server error
	CodeUnauthorized        = -32001 // Missing or invalid credentials
	CodeForbidden           = -32002 // Authenticated but lacking capability
	CodeToolUnavailable     = -32003 // Tool is not implemented in this build
	CodeIdempotencyConflict = -32004 // Idempotency-Key already used with different params
)

// ---------------------------------------------------------------------------
// Parse / emit
// ---------------------------------------------------------------------------

// ParseRequest parses a JSON-RPC 2.0 request envelope from raw bytes.
func ParseRequest(body []byte) (Envelope, error) {
	if len(body) == 0 {
		return Envelope{}, fmt.Errorf("%w: empty body", ErrInvalidJSON)
	}
	var env Envelope
	dec := json.NewDecoder(bytesReader(body))
	dec.UseNumber()
	dec.DisallowUnknownFields()
	if err := dec.Decode(&env); err != nil {
		// Strict mode is a little aggressive for JSON-RPC 2.0 — fall
		// back to permissive decoding if the strict pass fails.
		var loose Envelope
		if err2 := json.Unmarshal(body, &loose); err2 != nil {
			return Envelope{}, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
		}
		env = loose
	}
	if env.JSONRPC != "2.0" {
		return Envelope{}, fmt.Errorf("%w: jsonrpc field must be \"2.0\", got %q", ErrInvalidJSON, env.JSONRPC)
	}
	if env.Method == "" {
		return Envelope{}, fmt.Errorf("%w: method is required", ErrInvalidRequest)
	}
	return env, nil
}

// NewResponse constructs a successful response.
func NewResponse(id json.RawMessage, result any) Response {
	return Response{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	}
}

// NewErrorResponse constructs an error response.
func NewErrorResponse(id json.RawMessage, code int, message string, data any) Response {
	var dataRaw json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err == nil {
			dataRaw = b
		}
	}
	return Response{
		JSONRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
			Data:    dataRaw,
		},
	}
}

// IDIsNull reports whether the JSON-RPC id is JSON null (a "notification").
func (r Response) IDIsNull() bool {
	return len(r.ID) == 0 || string(r.ID) == "null"
}

// IsNotification reports whether the request envelope is a notification
// (id is JSON null or absent). Notifications are not paired with a
// response and the gateway must not write one.
func (e Envelope) IsNotification() bool {
	return len(e.ID) == 0 || string(e.ID) == "null"
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// ErrInvalidJSON is returned when the request body is not valid JSON.
var ErrInvalidJSON = errors.New("gateway: invalid JSON")

// ErrInvalidRequest is returned when the JSON parses but the envelope
// is not a valid JSON-RPC 2.0 request.
var ErrInvalidRequest = errors.New("gateway: invalid request")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func bytesReader(b []byte) *bytes.Reader { return bytes.NewReader(b) }
