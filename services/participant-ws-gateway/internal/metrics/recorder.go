// Package metrics defines the MetricsRecorder interface used across
// the gateway (router, transport, bus). The implementation lives in
// internal/observability.
package metrics

// Recorder is the gateway's interface to the metrics layer. The
// prometheus-backed implementation lives in internal/observability;
// tests can use the in-memory RecorderFuncs.
type Recorder interface {
	RecordWSOpenMs(ms int64)
	RecordFanoutLatency(ms int64)
	RecordActiveParticipants(delta int64)
	IncOpened()
	IncClosed()
	IncPublish()
}

// Null is a no-op recorder used in tests that don't care about metrics.
type Null struct{}

func (Null) RecordWSOpenMs(int64)            {}
func (Null) RecordFanoutLatency(int64)       {}
func (Null) RecordActiveParticipants(int64)  {}
func (Null) IncOpened()                      {}
func (Null) IncClosed()                      {}
func (Null) IncPublish()                     {}