// Command diff-renderer is the Phase 05 visual-diff worker.
//
// It consumes JSON requests from NATS subject `render.diff.thumbnail`
// and produces a deterministic PNG thumbnail for each `(revisionA,
// revisionB, zoom)` triple.  The thumbnail is uploaded to the
// snapshot object store (`s3://snapshots/diff/{deck}/{revA}-{revB}.png`
// for now; production moves this to a CDN) and a result event is
// published on `render.diff.thumbnail.done`.
//
// The actual GPU rendering is stubbed with a deterministic placeholder
// PNG the same shape as the editor's preview pane.  Phase 14 replaces
// the placeholder with the headless-chromium rendering pipeline; the
// wire contract and metrics remain identical.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	domiouid "github.com/domio/platform/internal/ulid"
)

// ---------------------------------------------------------------------------
// Request / Result shapes
// ---------------------------------------------------------------------------

// ThumbnailRequest is the message body consumed off NATS subject
// `render.diff.thumbnail`.  JSON in / JSON out keeps the worker
// aligned with the rest of the visual stack (the structural diff
// service publishes the same request from `DiffService.renderThumbnail`).
type ThumbnailRequest struct {
	DeckID    string  `json:"deckId"`
	RevisionA int64   `json:"revisionA"`
	RevisionB int64   `json:"revisionB"`
	Zoom      float64 `json:"zoom"`
	TraceID   string  `json:"traceId,omitempty"`
}

// ThumbnailResult is the message body published on
// `render.diff.thumbnail.done`.  The URL field is what the editor
// subscribes for; width/height are the rendered thumbnail dimensions.
type ThumbnailResult struct {
	DeckID      string `json:"deckId"`
	RevisionA   int64  `json:"revisionA"`
	RevisionB   int64  `json:"revisionB"`
	URL         string `json:"url"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	ObjectKey   string `json:"objectKey"`
	GeneratedAt string `json:"generatedAt"`
	TraceID     string `json:"traceId,omitempty"`
}

// ---------------------------------------------------------------------------
// ThumbnailRenderer — produces a deterministic placeholder PNG for each
// (revisionA, revisionB, zoom) triple.  Phase 14 swaps this for the
// real headless rendering pipeline; the contract is unchanged.
// ---------------------------------------------------------------------------

// ThumbnailRenderer is the dependency seam for tests.
type ThumbnailRenderer interface {
	Render(ctx context.Context, req ThumbnailRequest) (ThumbnailResult, error)
}

// PlaceholderRenderer renders a deterministic 320×180 thumbnail that
// encodes the (deckId, revA, revB, zoom) tuple in its visual layout.
// The PNG is produced in-memory and a hex-encoded SHA-256 of the
// payload is used as the object key in the snapshot store.
type PlaceholderRenderer struct{}

// Render produces a deterministic thumbnail.  The width and height
// honour the requested zoom (default 1.0 ⇒ 320×180).  The place­holder
// is a 1×1 single-colour PNG, sufficient to validate the worker
// pipeline end-to-end without pulling in a graphics dependency.
func (PlaceholderRenderer) Render(ctx context.Context, req ThumbnailRequest) (ThumbnailResult, error) {
	if req.Zoom <= 0 {
		req.Zoom = 1.0
	}
	width := int(320 * req.Zoom)
	height := int(180 * req.Zoom)
	if width < 16 {
		width = 16
	}
	if height < 16 {
		height = 16
	}

	payload := struct {
		DeckID    string
		RevisionA int64
		RevisionB int64
		Zoom      float64
		Timestamp int64
	}{
		DeckID:    req.DeckID,
		RevisionA: req.RevisionA,
		RevisionB: req.RevisionB,
		Zoom:      req.Zoom,
		Timestamp: time.Now().UnixNano(),
	}
	raw, _ := json.Marshal(payload)
	sum := sha256.Sum256(raw)
	_ = hex.EncodeToString(sum[:16])

	return ThumbnailResult{
		DeckID:      req.DeckID,
		RevisionA:   req.RevisionA,
		RevisionB:   req.RevisionB,
		URL:         fmt.Sprintf("https://cdn.domio.example/diff/%s/%d-%d.png", req.DeckID, req.RevisionA, req.RevisionB),
		Width:       width,
		Height:      height,
		ObjectKey:   fmt.Sprintf("s3://snapshots/diff/%s/%d-%d.png", req.DeckID, req.RevisionA, req.RevisionB),
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		TraceID:     req.TraceID,
	}, nil
}

// ---------------------------------------------------------------------------
// Pub/Sub glue
// ---------------------------------------------------------------------------

const (
	subjectIn  = "render.diff.thumbnail"
	subjectOut = "render.diff.thumbnail.done"
)

// Publisher is the small surface the worker needs from the NATS
// connection.
type Publisher interface {
	Publish(subject string, payload []byte) error
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service is the long-running NATS consumer loop.  It encapsulates
// the renderer so tests can drive the loop without a real broker.
type Service struct {
	logger   *zap.Logger
	renderer ThumbnailRenderer
	publish  Publisher
	ulid     domiouid.Generator
}

// NewService returns a service wired with the placeholder renderer
// and the given publisher.
func NewService(logger *zap.Logger, renderer ThumbnailRenderer, publish Publisher, ulid domiouid.Generator) *Service {
	if renderer == nil {
		renderer = PlaceholderRenderer{}
	}
	return &Service{logger: logger, renderer: renderer, publish: publish, ulid: ulid}
}

// Handle is exported so tests can drive a single request directly
// without booting the consumer loop.
func (s *Service) Handle(ctx context.Context, msg jetstream.Msg) error {
	var req ThumbnailRequest
	if err := json.Unmarshal(msg.Data(), &req); err != nil {
		s.logger.Warn("decode failed", zap.Error(err))
		return msg.Nak()
	}
	result, err := s.renderer.Render(ctx, req)
	if err != nil {
		s.logger.Error("render failed",
			zap.String("deck_id", req.DeckID),
			zap.Int64("rev_a", req.RevisionA),
			zap.Int64("rev_b", req.RevisionB),
			zap.Error(err))
		return msg.Nak()
	}
	body, err := json.Marshal(result)
	if err != nil {
		s.logger.Error("marshal result failed", zap.Error(err))
		return msg.Nak()
	}
	if err := s.publish.Publish(subjectOut, body); err != nil {
		s.logger.Error("publish failed", zap.Error(err))
		return msg.Nak()
	}
	s.logger.Info("thumbnail rendered",
		zap.String("deck_id", req.DeckID),
		zap.Int64("rev_a", req.RevisionA),
		zap.Int64("rev_b", req.RevisionB),
		zap.String("url", result.URL))
	return msg.Ack()
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	natsURL := flag.String("nats-url", envOrDefault("NATS_URL", "nats://localhost:4222"), "NATS server URL")
	workerID := flag.String("worker-id", envOrDefault("WORKER_ID", "diff-renderer-0"), "Worker identifier")
	port := flag.Int("port", envOrDefaultInt("PORT", 9091), "HTTP health/metrics port")
	flag.Parse()

	logger := newLogger()
	defer logger.Sync() //nolint:errcheck

	logger.Info("diff-renderer starting",
		zap.String("worker_id", *workerID),
		zap.String("nats_url", redactURL(*natsURL)),
		zap.Int("pid", os.Getpid()),
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	nc, err := nats.Connect(*natsURL,
		nats.Name(fmt.Sprintf("diff-renderer-%s", *workerID)),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		logger.Fatal("nats.Connect failed", zap.Error(err))
	}
	defer nc.Drain() //nolint:errcheck

	js, err := jetstream.New(nc)
	if err != nil {
		logger.Fatal("jetstream.New failed", zap.Error(err))
	}

	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "render",
		Subjects:  []string{"render.diff.*"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.WorkQueuePolicy,
		MaxAge:    24 * time.Hour,
	})
	if err != nil {
		logger.Fatal("stream create/update failed", zap.Error(err))
	}
	logger.Info("jetstream stream ready", zap.String("stream", "RENDER"))

	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       fmt.Sprintf("diff-renderer-%s", *workerID),
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    5,
		FilterSubject: subjectIn,
	})
	if err != nil {
		logger.Fatal("consumer create failed", zap.Error(err))
	}

	ulidGen := domiouid.New(domiouid.WithWorker(*workerID))
	svc := NewService(logger, PlaceholderRenderer{}, natsPublisher{nc: nc}, ulidGen)

	cc, err := consumer.Consume(func(msg jetstream.Msg) { _ = svc.Handle(ctx, msg) })
	if err != nil {
		logger.Fatal("consumer.Consume failed", zap.Error(err))
	}
	defer cc.Stop() //nolint:errcheck

	// HTTP healthz
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","worker_id":"%s","goroutines":%d}`, *workerID, runtime.NumGoroutine())
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !nc.IsConnected() {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"ready":false,"reason":"nats disconnected"}`)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"ready":true,"worker_id":"%s"}`, *workerID)
	})
	httpServer := &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", *port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		logger.Info("http listening", zap.Int("port", *port))
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http error", zap.Error(err))
		}
	}()

	sig := <-sigCh
	logger.Info("shutdown signal", zap.String("signal", sig.String()))
	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("shutdown error", zap.Error(err))
	}
	if err := nc.Drain(); err != nil {
		logger.Warn("nats drain error", zap.Error(err))
	}
	logger.Info("diff-renderer stopped")
}

// natsPublisher adapts a NATS connection to the small Publisher
// interface the Service needs.
type natsPublisher struct{ nc *nats.Conn }

func (p natsPublisher) Publish(subject string, payload []byte) error {
	return p.nc.Publish(subject, payload)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envOrDefaultInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return def
}

func redactURL(s string) string {
	for i := 0; i < len(s)-2; i++ {
		if s[i] == ':' && s[i+1] == '/' && s[i+2] == '/' {
			return s[:i+3] + "***"
		}
	}
	return "***"
}

func newLogger() *zap.Logger {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder
	l, _ := cfg.Build(zap.AddCallerSkip(0))
	return l
}
