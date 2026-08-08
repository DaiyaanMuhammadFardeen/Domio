package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// SSEEvent is one event in the Server-Sent Events stream.
type SSEEvent struct {
	// Event is the SSE "event:" field (e.g. "status", "artifact", "done", "error").
	Event string
	// Data is the SSE "data:" field. It must be JSON-serializable.
	Data any
}

// SSEWriter writes events to an HTTP response using the
// text/event-stream format. It is goroutine-safe.
//
// The transport pattern is reused from services/ai-orchestrator/internal/router/router.go
// — heartbeat ticker + chunked writes + Flush() after each chunk.
type SSEWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
	mu      sync.Mutex
	closed  bool
}

// NewSSEWriter prepares the response for SSE, writes the headers,
// and returns the writer. If the underlying ResponseWriter does not
// support flushing, an error is returned and the caller should fall
// back to a non-streaming response.
func NewSSEWriter(w http.ResponseWriter) (*SSEWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("gateway: ResponseWriter does not support flushing")
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	return &SSEWriter{w: w, flusher: flusher}, nil
}

// Write sends an event to the stream. The event is JSON-encoded with
// each chunk emitted as "event: <name>\ndata: <payload>\n\n".
func (s *SSEWriter) Write(ev SSEEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("gateway: SSE writer is closed")
	}
	payload, err := json.Marshal(ev.Data)
	if err != nil {
		return fmt.Errorf("gateway: marshal SSE payload: %w", err)
	}
	if ev.Event != "" {
		if _, err := fmt.Fprintf(s.w, "event: %s\n", ev.Event); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", payload); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// WriteRaw sends a pre-encoded event payload. Useful for streaming
// JSON-RPC responses when the envelope is already serialized.
func (s *SSEWriter) WriteRaw(event string, payload []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("gateway: SSE writer is closed")
	}
	if event != "" {
		if _, err := fmt.Fprintf(s.w, "event: %s\n", event); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", payload); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// WriteHeartbeat sends a comment line (": ping\n\n") which is
// valid SSE but ignored by clients. Use it to keep the connection
// alive through proxies.
func (s *SSEWriter) WriteHeartbeat() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	if _, err := fmt.Fprint(s.w, ": ping\n\n"); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

// Close marks the writer as closed. Subsequent Write calls will
// return an error.
func (s *SSEWriter) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
}

// Heartbeat runs a heartbeat loop until the context is cancelled or
// the writer is closed. It writes a "ping" comment every `interval`.
// Returns the first error encountered, or nil if the context was
// cancelled cleanly.
func (s *SSEWriter) Heartbeat(ctx context.Context, interval time.Duration) error {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			if err := s.WriteHeartbeat(); err != nil {
				return err
			}
		}
	}
}