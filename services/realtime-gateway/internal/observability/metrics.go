// Package observability provides metrics, OTel tracing helpers,
// and structured zap logger setup for the realtime gateway.
//
// NOTE: github.com/prometheus/client_golang is not currently in go.mod.
// The metrics below use a lightweight in-memory implementation that mirrors
// the Prometheus API surface. When prometheus/client_golang is added to the
// module, swap MetricsHandler to promhttp.Handler() and replace the gauge/
// histogram types with prometheus.Gauge / prometheus.Histogram.
package observability

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sort"
	"sync/atomic"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// ─── Lightweight metrics registry ───────────────────────────────────

// Gauge is a simple atomic float64 gauge.
type Gauge struct {
	name  string
	value atomic.Int64 // stored as fixed-point * 1000
}

// Set updates the gauge to the given value.
func (g *Gauge) Set(v float64) {
	g.value.Store(int64(v * 1000))
}

// Inc increments the gauge by 1.
func (g *Gauge) Inc() { g.Add(1) }

// Dec decrements the gauge by 1.
func (g *Gauge) Dec() { g.Add(-1) }

// Add increments the gauge by delta.
func (g *Gauge) Add(delta float64) {
	for {
		old := g.value.Load()
		new := old + int64(delta*1000)
		if g.value.CompareAndSwap(old, new) {
			return
		}
	}
}

// Value returns the current gauge value.
func (g *Gauge) Value() float64 {
	return float64(g.value.Load()) / 1000.0
}

// Histogram is a lock-free histogram with pre-defined buckets.
type Histogram struct {
	name    string
	buckets []float64
	counts  []atomic.Int64
	total   atomic.Int64 // sum * 1000
	n       atomic.Int64
}

// NewHistogram creates a histogram with the given bucket boundaries.
func NewHistogram(name string, buckets []float64) *Histogram {
	return &Histogram{
		name:    name,
		buckets: buckets,
		counts:  make([]atomic.Int64, len(buckets)+1),
	}
}

// Observe records a value.
func (h *Histogram) Observe(v float64) {
	h.total.Add(int64(v * 1000))
	h.n.Add(1)
	idx := sort.SearchFloat64s(h.buckets, v)
	h.counts[idx].Add(1)
}

// Count returns the number of observations.
func (h *Histogram) Count() int64 { return h.n.Load() }

// Sum returns the sum of observed values.
func (h *Histogram) Sum() float64 { return float64(h.total.Load()) / 1000.0 }

// ─── Application metrics ────────────────────────────────────────────

var (
	SyncOpApplyDuration   = NewHistogram("sync_op_apply_duration_ms", []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000})
	SyncOpRoundTrip       = NewHistogram("sync_op_round_trip_ms", []float64{5, 10, 25, 50, 100, 250, 500, 1000, 2000})
	SyncActiveConns       = &Gauge{name: "sync_active_connections"}
	SyncCRDTConvergence   = NewHistogram("sync_crdt_convergence_ms", []float64{1, 5, 10, 25, 50, 100, 250, 500})
	PresenceActiveSessions = &Gauge{name: "presence_active_sessions"}
	PresenceCursorLatency  = NewHistogram("presence_cursor_latency_ms", []float64{1, 2, 5, 10, 25, 50, 100, 250})
)

// MetricsHandler returns an HTTP handler that serves metrics in a
// Prometheus-compatible text format.
func MetricsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		allGauges := []*Gauge{SyncActiveConns, PresenceActiveSessions}
		allHists := []*Histogram{SyncOpApplyDuration, SyncOpRoundTrip, SyncCRDTConvergence, PresenceCursorLatency}

		for _, g := range allGauges {
			fmt.Fprintf(w, "# HELP rtgw_%s Current value\n# TYPE rtgw_%s gauge\nrtgw_%s %v\n",
				g.name, g.name, g.name, g.Value())
		}
		for _, h := range allHists {
			fmt.Fprintf(w, "# HELP rtgw_%s Histogram observations\n# TYPE rtgw_%s histogram\n",
				h.name, h.name)
			cum := int64(0)
			for i, b := range h.buckets {
				cum += h.counts[i].Load()
				fmt.Fprintf(w, "rtgw_%s_bucket{le=\"%v\"} %d\n", h.name, b, cum)
			}
			cum += h.counts[len(h.buckets)].Load()
			fmt.Fprintf(w, "rtgw_%s_bucket{le=\"+Inf\"} %d\nrtgw_%s_count %d\nrtgw_%s_sum %v\n",
				h.name, cum, h.name, h.n.Load(), h.name, h.Sum())
		}
	})
}

// ─── OpenTelemetry tracing ──────────────────────────────────────────

// InitTracer sets up the OTLP gRPC exporter and returns a shutdown func.
func InitTracer(ctx context.Context, serviceName, endpoint string) (func(context.Context) error, error) {
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp exporter: %w", err)
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("resource merge: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	return tp.Shutdown, nil
}

// ─── Structured logging ─────────────────────────────────────────────

// NewLogger creates a production-grade zap JSON logger.
func NewLogger() (*zap.Logger, error) {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder
	return cfg.Build(zap.AddCallerSkip(0))
}

// SuppressPayload returns a logger that redacts payload bytes in log entries.
func SuppressPayload(logger *zap.Logger) *zap.Logger {
	return logger.WithOptions(zap.WrapCore(func(core zapcore.Core) zapcore.Core {
		return &payloadRedactingCore{Core: core}
	}))
}

type payloadRedactingCore struct {
	zapcore.Core
}

func (c *payloadRedactingCore) Write(entry zapcore.Entry, fields []zapcore.Field) error {
	for i := range fields {
		if fields[i].Key == "payload" || fields[i].Key == "data" {
			fields[i] = zap.String(fields[i].Key, "[redacted]")
		}
	}
	return c.Core.Write(entry, fields)
}

func (c *payloadRedactingCore) With(fields []zapcore.Field) zapcore.Core {
	return &payloadRedactingCore{Core: c.Core.With(fields)}
}

// ─── OTel span name constants ───────────────────────────────────────

const (
	SpanHello         = "realtime.hello"
	SpanOpApply       = "realtime.op.apply"
	SpanPresenceFO    = "realtime.presence.fanout"
	SpanPingRelay     = "realtime.ping.relay"
	SpanChatBroadcast = "realtime.chat.broadcast"
)

// StartSpan starts a new tracing span from the global provider.
func StartSpan(ctx context.Context, name string) context.Context {
	ctx, _ = otel.Tracer("rtgw").Start(ctx, name)
	return ctx
}

// Min returns the smaller of two float64s.
func Min(a, b float64) float64 {
	return math.Min(a, b)
}
