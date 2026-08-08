// Tests for the Phase 15 presenter metrics surface in the realtime
// gateway. These cover the gauge values used by the dashboard and
// the role-normalisation helper.
package observability

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSetFailoverRole_NormalisesValues(t *testing.T) {
	cases := []struct {
		mode string
		want float64
	}{
		{"primary", 2},
		{"standby", 1},
		{"disabled", 0},
		{"", 0},
		{"unknown", 0},
	}
	for _, c := range cases {
		SetFailoverRole(c.mode)
		if got := PresenterFailoverRole.Value(); got != c.want {
			t.Errorf("SetFailoverRole(%q) = %v, want %v", c.mode, got, c.want)
		}
	}
}

func TestMetricsHandler_RendersPresenterGauges(t *testing.T) {
	SetFailoverRole("primary")
	rec := httptest.NewRecorder()
	MetricsHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	body := rec.Body.String()
	for _, want := range []string{
		"presenter_active_sessions",
		"presenter_failover_role",
		"presenter_annotation_fanout_ms",
		"sync_op_apply_duration_ms",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics output missing %q — got:\n%s", want, body)
		}
	}
	if !strings.Contains(body, "presenter_annotation_fanout_ms_bucket") {
		t.Errorf("annotation fanout histogram not emitted as bucket boundaries")
	}
}

func TestHistogramObserve_AnnotationFanout(t *testing.T) {
	before := AnnotationFanoutLatency.Count()
	AnnotationFanoutLatency.Observe(120)
	AnnotationFanoutLatency.Observe(220)
	if got := AnnotationFanoutLatency.Count(); got != before+2 {
		t.Errorf("expected count %d, got %d", before+2, got)
	}
	if sum := AnnotationFanoutLatency.Sum(); sum < 340 {
		t.Errorf("expected sum >= 340, got %v", sum)
	}
}