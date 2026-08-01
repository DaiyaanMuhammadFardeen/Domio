// Package snapshot metrics — Phase 05 D.4.
//
// The snapshot materializer emits two metric families:
//
//   - `snapshot_size_bytes`     (histogram)
//   - `snapshot_duration_ms`    (histogram)
//
// These are the counters used by the `branch_*` Grafana dashboard
// panels and by the `SnapshotDurationMsBreached` alert
// (`snapshot_duration_ms p95 > 5000 ms`) the spec lists.
package snapshot

import (
	"sync/atomic"
)

// Metrics is a tiny in-process counters holder.  In production the
// snapshot worker swaps this for a prom-client adapter behind the
// same surface; tests exercise the in-memory variant.
type Metrics struct {
	snapshotCount   atomic.Int64
	snapshotBytes   atomic.Int64
	totalDurationMs atomic.Int64

	// failure counters fire when the materializer hits an error.
	failedInserts  atomic.Int64
	failedMaterializes atomic.Int64
}

// NewMetrics returns a zero-valued Metrics holder.
func NewMetrics() *Metrics {
	return &Metrics{}
}

// RecordSnapshot updates the counters after a successful snapshot.
// `byteSize` is the compressed payload size; `durationMs` is wall
// clock from `Begin` to `End` in the caller.
func (m *Metrics) RecordSnapshot(byteSize int64, durationMs int64) {
	m.snapshotCount.Add(1)
	m.snapshotBytes.Add(byteSize)
	m.totalDurationMs.Add(durationMs)
}

// RecordFailedInsert bumps the failed-insert counter.
func (m *Metrics) RecordFailedInsert() {
	m.failedInserts.Add(1)
}

// RecordFailedMaterialize bumps the failed-materialize counter.
func (m *Metrics) RecordFailedMaterialize() {
	m.failedMaterializes.Add(1)
}

// SnapshotCount is the number of snapshots the worker has produced.
func (m *Metrics) SnapshotCount() int64 { return m.snapshotCount.Load() }

// TotalBytes is the cumulative size of every snapshot's payload.
func (m *Metrics) TotalBytes() int64 { return m.snapshotBytes.Load() }

// AverageDurationMs is the mean duration, suitable for the
// `snapshot_duration_ms` Grafana panel.
func (m *Metrics) AverageDurationMs() float64 {
	if count := m.snapshotCount.Load(); count > 0 {
		return float64(m.totalDurationMs.Load()) / float64(count)
	}
	return 0
}

// FailedInserts is incremented every time the underlying pgx store
// rejected a snapshot row.
func (m *Metrics) FailedInserts() int64 { return m.failedInserts.Load() }

// FailedMaterializes is incremented every time the materializer
// aborted (e.g. compression failure).
func (m *Metrics) FailedMaterializes() int64 { return m.failedMaterializes.Load() }
