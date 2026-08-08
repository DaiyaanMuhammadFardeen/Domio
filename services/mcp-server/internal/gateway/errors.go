package gateway

import (
	"encoding/json"
	"net/http"
)

// ProblemDetail is an RFC-7807-style error envelope. It is sent in
// the `data` field of a JSON-RPC error response, and also as the
// JSON body of non-JSON-RPC HTTP error responses (e.g. 401/404/500).
//
// The fields here mirror the problem-detail spec:
//   - type:     a URI that identifies the problem type (default "about:blank").
//   - title:    a short, human-readable summary.
//   - status:   the HTTP status code (mirrored from the outer response).
//   - detail:   a longer explanation specific to this occurrence.
//   - instance: a URI identifying this specific occurrence (request ID).
//
// We extend the spec with a few Domio-specific fields:
//
//   - code:    a stable, machine-readable error code (e.g. "not_found").
//   - request_id: the X-Request-ID for log correlation.
//   - extras:  free-form additional fields (capability, kid, etc.).
type ProblemDetail struct {
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Status    int            `json:"status"`
	Detail    string         `json:"detail,omitempty"`
	Instance  string         `json:"instance,omitempty"`
	Code      string         `json:"code,omitempty"`
	RequestID string         `json:"request_id,omitempty"`
	Extras    map[string]any `json:"extras,omitempty"`
}

// WriteProblem writes a problem-detail response to w with the given
// HTTP status. Content-Type is set to application/problem+json per
// the RFC, with a fallback to application/json for clients that don't
// recognize that type.
func WriteProblem(w http.ResponseWriter, p ProblemDetail) {
	if p.Type == "" {
		p.Type = "about:blank"
	}
	body, err := json.Marshal(p)
	if err != nil {
		// Fall back to a minimal response if marshaling fails.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"type":"about:blank","title":"internal error","status":500}`))
		return
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)
	_, _ = w.Write(body)
}

// WriteProblemWithCode is a convenience constructor for common cases.
func WriteProblemWithCode(w http.ResponseWriter, status int, code, title, detail string) {
	WriteProblem(w, ProblemDetail{
		Status: status,
		Code:   code,
		Title:  title,
		Detail: detail,
	})
}