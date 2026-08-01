package snapshot

import "testing"

func TestMetricsRecordSnapshot(t *testing.T) {
	m := NewMetrics()
	m.RecordSnapshot(1024, 100)
	m.RecordSnapshot(2048, 50)
	if got := m.SnapshotCount(); got != 2 {
		t.Fatalf("SnapshotCount: expected 2, got %d", got)
	}
	if got := m.TotalBytes(); got != 3072 {
		t.Fatalf("TotalBytes: expected 3072, got %d", got)
	}
	got := m.AverageDurationMs()
	if got != 75 {
		t.Fatalf("AverageDurationMs: expected 75.0, got %v", got)
	}
}

func TestMetricsFailureCounters(t *testing.T) {
	m := NewMetrics()
	m.RecordFailedInsert()
	m.RecordFailedInsert()
	m.RecordFailedMaterialize()
	if got := m.FailedInserts(); got != 2 {
		t.Fatalf("FailedInserts: expected 2, got %d", got)
	}
	if got := m.FailedMaterializes(); got != 1 {
		t.Fatalf("FailedMaterializes: expected 1, got %d", got)
	}
}

func TestMetricsZeroAverageWhenEmpty(t *testing.T) {
	m := NewMetrics()
	if got := m.AverageDurationMs(); got != 0 {
		t.Fatalf("AverageDurationMs on empty should be 0, got %v", got)
	}
}
