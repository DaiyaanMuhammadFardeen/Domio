// Package metrics owns the Prometheus collectors surfaced by the
// clickhouse-loader service.
package metrics

import (
	"net/http"
	"sync/atomic"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds the per-process counters and histograms.
type Metrics struct {
	registry        *prometheus.Registry
	insertSuccess   prometheus.Counter
	insertFailure   prometheus.Counter
	rowsInserted    prometheus.Counter
	dlqTotal        *prometheus.CounterVec
	kafkaReadErrors prometheus.Counter
	batchSize       prometheus.Histogram
	insertLatency   prometheus.Histogram
	startedAt       atomic.Int64
}

// New builds the metrics registry and registers all collectors.
func New() *Metrics {
	reg := prometheus.NewRegistry()
	m := &Metrics{
		registry: reg,
		insertSuccess: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "domio_clickhouse_loader_inserts_total",
			Help: "Total number of successful ClickHouse INSERT batches.",
		}),
		insertFailure: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "domio_clickhouse_loader_insert_failures_total",
			Help: "Total number of failed ClickHouse INSERT batches.",
		}),
		rowsInserted: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "domio_clickhouse_loader_rows_total",
			Help: "Total number of rows inserted into ClickHouse.",
		}),
		dlqTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "domio_clickhouse_loader_dlq_total",
			Help: "Total number of messages routed to DLQ, by reason.",
		}, []string{"reason"}),
		kafkaReadErrors: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "domio_clickhouse_loader_kafka_read_errors_total",
			Help: "Total number of Kafka read errors.",
		}),
		batchSize: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "domio_clickhouse_loader_batch_size",
			Help:    "Distribution of batch sizes (rows) flushed to ClickHouse.",
			Buckets: []float64{1, 10, 100, 500, 1000, 5000, 10000},
		}),
		insertLatency: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "domio_clickhouse_loader_insert_latency_seconds",
			Help:    "Distribution of ClickHouse INSERT latency.",
			Buckets: []float64{0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30},
		}),
	}
	reg.MustRegister(
		m.insertSuccess,
		m.insertFailure,
		m.rowsInserted,
		m.dlqTotal,
		m.kafkaReadErrors,
		m.batchSize,
		m.insertLatency,
	)
	return m
}

// RecordInsertSuccess updates counters after a successful INSERT.
func (m *Metrics) RecordInsertSuccess(rows int) {
	m.insertSuccess.Inc()
	m.rowsInserted.Add(float64(rows))
	m.batchSize.Observe(float64(rows))
}

// RecordInsertFailure updates counters after a failed INSERT.
func (m *Metrics) RecordInsertFailure(rows int) {
	m.insertFailure.Inc()
	m.batchSize.Observe(float64(rows))
}

// RecordInsertLatency records the wall-clock time of an INSERT.
func (m *Metrics) RecordInsertLatency(seconds float64) {
	m.insertLatency.Observe(seconds)
}

// RecordDlq increments the DLQ counter for a given reason.
func (m *Metrics) RecordDlq(reason string) {
	m.dlqTotal.WithLabelValues(reason).Inc()
}

// RecordKafkaReadError increments the Kafka read error counter.
func (m *Metrics) RecordKafkaReadError() {
	m.kafkaReadErrors.Inc()
}

// Handler returns the HTTP handler that exposes /metrics.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{Registry: m.registry})
}

// MetricsHandler wraps Handler in an httptest.Server. Tests use this
// to fetch the rendered Prometheus text.
func MetricsHandler(m *Metrics) http.Handler {
	return m.Handler()
}
