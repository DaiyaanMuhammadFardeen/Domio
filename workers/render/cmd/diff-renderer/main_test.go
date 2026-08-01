package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.uber.org/zap"

	domiouid "github.com/domio/platform/internal/ulid"
)

// ---------------------------------------------------------------------------
// fakePublisher captures published payloads for inspection.
// ---------------------------------------------------------------------------

type fakePublisher struct {
	subjects []string
	payloads [][]byte
}

func (p *fakePublisher) Publish(subject string, payload []byte) error {
	p.subjects = append(p.subjects, subject)
	p.payloads = append(p.payloads, payload)
	return nil
}

// ---------------------------------------------------------------------------
// fakeMsg is the minimal jetstream.Msg shape Service.Handle needs.
// ---------------------------------------------------------------------------

type fakeMsg struct {
	data []byte
	ack  bool
	nak  bool
	term bool
}

func (m *fakeMsg) Data() []byte                              { return m.data }
func (m *fakeMsg) Ack() error                                { m.ack = true; return nil }
func (m *fakeMsg) DoubleAck(context.Context) error           { m.ack = true; return nil }
func (m *fakeMsg) Nak() error                                { m.nak = true; return nil }
func (m *fakeMsg) NakWithDelay(time.Duration) error          { m.nak = true; return nil }
func (m *fakeMsg) InProgress() error                         { return nil }
func (m *fakeMsg) Term() error                               { m.term = true; return nil }
func (m *fakeMsg) TermWithReason(string) error               { m.term = true; return nil }
func (m *fakeMsg) Subject() string                           { return subjectIn }
func (m *fakeMsg) Reply() string                             { return "" }
func (m *fakeMsg) Headers() nats.Header                      { return nil }
func (m *fakeMsg) Metadata() (*jetstream.MsgMetadata, error) { return nil, nil }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestPlaceholderRendererDeterministic(t *testing.T) {
	// Two consecutive renders produce different `GeneratedAt`
	// timestamps because `time.Now` advances, but the URL and
	// dimensions are deterministic for the same input.
	req := ThumbnailRequest{
		DeckID:    "01H0000000000000000000000A",
		RevisionA: 1,
		RevisionB: 2,
		Zoom:      1.0,
	}
	a, err := PlaceholderRenderer{}.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	if a.Width != 320 || a.Height != 180 {
		t.Fatalf("expected 320×180, got %d×%d", a.Width, a.Height)
	}
	if a.URL == "" {
		t.Fatalf("expected URL to be set")
	}
	if !contains(a.ObjectKey, "01H0000000000000000000000A") {
		t.Fatalf("expected object key to include deck id, got %q", a.ObjectKey)
	}
}

func TestPlaceholderRendererZoomApplied(t *testing.T) {
	req := ThumbnailRequest{
		DeckID:    "deck-x",
		RevisionA: 1,
		RevisionB: 2,
		Zoom:      0.5,
	}
	a, err := PlaceholderRenderer{}.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	if a.Width != 160 || a.Height != 90 {
		t.Fatalf("expected 160×90, got %d×%d", a.Width, a.Height)
	}
}

func TestPlaceholderRendererNegativeZoomClampsToMin(t *testing.T) {
	req := ThumbnailRequest{Zoom: -1}
	a, err := PlaceholderRenderer{}.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	if a.Width != 320 || a.Height != 180 {
		t.Fatalf("expected 320×180 default, got %d×%d", a.Width, a.Height)
	}
}

func TestServiceHandleRendersAndPublishes(t *testing.T) {
	publish := &fakePublisher{}
	svc := NewService(zap.NewNop(), PlaceholderRenderer{}, publish, domiouid.New())
	body, _ := json.Marshal(ThumbnailRequest{
		DeckID:    "deck-h",
		RevisionA: 5,
		RevisionB: 6,
		Zoom:      1.0,
	})
	err := svc.Handle(context.Background(), &fakeMsg{data: body})
	if err != nil {
		t.Fatalf("handle failed: %v", err)
	}
	if len(publish.subjects) != 1 || publish.subjects[0] != subjectOut {
		t.Fatalf("expected one publish on %s, got %v", subjectOut, publish.subjects)
	}
	var got ThumbnailResult
	if err := json.Unmarshal(publish.payloads[0], &got); err != nil {
		t.Fatalf("published payload did not parse: %v", err)
	}
	if got.DeckID != "deck-h" {
		t.Fatalf("expected deck-id to propagate, got %q", got.DeckID)
	}
	if got.URL == "" || got.ObjectKey == "" {
		t.Fatalf("expected URL and object key to be set, got %+v", got)
	}
}

func TestServiceHandleNakOnInvalidJSON(t *testing.T) {
	publish := &fakePublisher{}
	svc := NewService(zap.NewNop(), PlaceholderRenderer{}, publish, domiouid.New())
	msg := &fakeMsg{data: []byte("not-json")}
	err := svc.Handle(context.Background(), msg)
	if err != nil {
		t.Fatalf("handle should Nak, not error: %v", err)
	}
	if !msg.nak {
		t.Fatalf("expected Nak on bad payload")
	}
	if len(publish.subjects) != 0 {
		t.Fatalf("expected no publishes on bad payload, got %d", len(publish.subjects))
	}
}

func TestServiceHandleIsolatedRendererError(t *testing.T) {
	publish := &fakePublisher{}
	flaky := flakyRenderer{}
	svc := NewService(zap.NewNop(), flaky, publish, domiouid.New())
	body, _ := json.Marshal(ThumbnailRequest{DeckID: "deck-1", RevisionA: 1, RevisionB: 2})
	err := svc.Handle(context.Background(), &fakeMsg{data: body})
	if err != nil {
		t.Fatalf("handle should propagate via Nak, not throw: %v", err)
	}
}

type flakyRenderer struct{}

func (flakyRenderer) Render(_ context.Context, _ ThumbnailRequest) (ThumbnailResult, error) {
	return ThumbnailResult{}, errMock
}

var errMock = mockErr("renderer is down")

type mockErr string

func (m mockErr) Error() string { return string(m) }

// ensure the timestamp format is RFC3339 across renders
func TestPlaceholderRendererTimestampFormat(t *testing.T) {
	r := PlaceholderRenderer{}
	a, err := r.Render(context.Background(), ThumbnailRequest{DeckID: "d"})
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	if _, err := time.Parse(time.RFC3339, a.GeneratedAt); err != nil {
		t.Fatalf("GeneratedAt is not RFC3339: %v", err)
	}
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
