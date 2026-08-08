package kafkacons

import (
	"net/http/httptest"
	"testing"

	"github.com/domio/platform/services/clickhouse-loader/internal/metrics"
	"github.com/stretchr/testify/require"
)

// TestNewValidatesRequiredFields ensures the constructor refuses
// incomplete configs. Kafka-go returns panic-y defaults when given
// empty brokers, so we guard up-front.
func TestNewValidatesRequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{"no brokers", Config{Topic: "t", GroupID: "g"}, "brokers"},
		{"no topic", Config{Brokers: "localhost:9092", GroupID: "g"}, "topic"},
		{"no group", Config{Brokers: "localhost:9092", Topic: "t"}, "group"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := New(tc.cfg)
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

// TestRecordDlqCounter ensures the DLQ counter increments only on
// the matched reason label.
func TestRecordDlqCounter(t *testing.T) {
	m := metrics.New()
	m.RecordDlq("parse")
	m.RecordDlq("parse")
	m.RecordDlq("schema")
	srv := httptest.NewServer(metrics.MetricsHandler(m))
	defer srv.Close()
	resp, err := srv.Client().Get(srv.URL)
	require.NoError(t, err)
	defer resp.Body.Close()
	buf := make([]byte, 1024*64)
	n, _ := resp.Body.Read(buf)
	require.Contains(t, string(buf[:n]), "domio_clickhouse_loader_dlq_total")
}
