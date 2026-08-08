// Package observability exposes Prometheus metrics for the participant
// WS gateway. Mirrors services/realtime-gateway/internal/observability.
package observability

import (
	"github.com/prometheus/client_golang/prometheus"
)

// Metrics holds the Prometheus instruments.
type Metrics struct {
	WSOpenMs        prometheus.Histogram
	FanoutMs        prometheus.Histogram
	PublishCount    prometheus.Counter
	OpenCount       prometheus.Counter
	CloseCount      prometheus.Counter
	ActiveGauge     prometheus.Gauge
	registry        *prometheus.Registry
}

// New constructs and registers a new Metrics.
func New() *Metrics {
	reg := prometheus.NewRegistry()
	m := &Metrics{
		WSOpenMs: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "audience_ws_open_ms",
			Help: "WebSocket open latency (ms).",
			Buckets: []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500},
		}),
		FanoutMs: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "audience_fanout_ms",
			Help: "Fan-out latency (ms).",
			Buckets: []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500},
		}),
		PublishCount: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "audience_publish_total",
			Help: "Total audience publishes.",
		}),
		OpenCount: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "audience_ws_open_total",
			Help: "Total WebSocket opens.",
		}),
		CloseCount: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "audience_ws_close_total",
			Help: "Total WebSocket closes.",
		}),
		ActiveGauge: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "audience_participants_active",
			Help: "Active participants currently connected.",
		}),
		registry: reg,
	}
	reg.MustRegister(m.WSOpenMs, m.FanoutMs, m.PublishCount, m.OpenCount, m.CloseCount, m.ActiveGauge)
	return m
}

// Registry returns the prometheus registry.
func (m *Metrics) Registry() *prometheus.Registry { return m.registry }

// Recorder adapts Metrics to the router.MetricsRecorder interface.
type Recorder struct {
	M *Metrics
}

// NewRecorder wraps Metrics.
func NewRecorder(m *Metrics) *Recorder { return &Recorder{M: m} }

// RecordWSOpenMs records a handshake latency.
func (r *Recorder) RecordWSOpenMs(ms int64) { r.M.WSOpenMs.Observe(float64(ms)) }
// RecordFanoutLatency records a fan-out latency.
func (r *Recorder) RecordFanoutLatency(ms int64) { r.M.FanoutMs.Observe(float64(ms)) }
// RecordActiveParticipants adjusts the active gauge.
func (r *Recorder) RecordActiveParticipants(delta int64) { r.M.ActiveGauge.Add(float64(delta)) }
// IncOpened increments the open counter.
func (r *Recorder) IncOpened() { r.M.OpenCount.Inc() }
// IncClosed increments the close counter.
func (r *Recorder) IncClosed() { r.M.CloseCount.Inc() }
// IncPublish increments the publish counter.
func (r *Recorder) IncPublish() { r.M.PublishCount.Inc() }

// RecorderFuncs adapts plain funcs to the recorder interface, useful in
// tests where the prometheus registry isn't desired.
type RecorderFuncs struct {
	WSOpenMsFn        func(ms int64)
	FanoutMsFn        func(ms int64)
	ActiveFn          func(delta int64)
	OpenedFn          func()
	ClosedFn          func()
	PublishFn         func()
}

// RecordWSOpenMs delegates.
func (r *RecorderFuncs) RecordWSOpenMs(ms int64)            { r.WSOpenMsFn(ms) }
// RecordFanoutLatency delegates.
func (r *RecorderFuncs) RecordFanoutLatency(ms int64)       { r.FanoutMsFn(ms) }
// RecordActiveParticipants delegates.
func (r *RecorderFuncs) RecordActiveParticipants(delta int64) { r.ActiveFn(delta) }
// IncOpened delegates.
func (r *RecorderFuncs) IncOpened()                          { r.OpenedFn() }
// IncClosed delegates.
func (r *RecorderFuncs) IncClosed()                          { r.ClosedFn() }
// IncPublish delegates.
func (r *RecorderFuncs) IncPublish()                         { r.PublishFn() }