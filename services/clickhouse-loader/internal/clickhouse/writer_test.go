package clickhouse

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/domio/platform/services/clickhouse-loader/internal/model"
	"github.com/stretchr/testify/require"
)

// TestEventTime covers the millisecond → time.Time conversion that
// ClickHouse expects as DateTime64.
func TestEventTime(t *testing.T) {
	r := model.IngestRecord{TsMs: 1_700_000_000_000}
	got := r.EventTime()
	require.Equal(t, time.UnixMilli(1_700_000_000_000).UTC(), got)
}

// TestInsertEmpty ensures the writer is a no-op for empty batches.
// The real INSERT path requires a ClickHouse connection so we test
// only the early return.
func TestInsertEmpty(t *testing.T) {
	w := &Writer{}
	require.NoError(t, w.Insert(context.Background(), nil))
}

// TestNewWriterBadAddrFails confirms constructor fails fast on bad
// addresses. We use a closed port to avoid waiting for the default
// 5s dial timeout.
func TestNewWriterBadAddrFails(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := l.Addr().String()
	require.NoError(t, l.Close())

	_, err = NewWriter(Config{
		Addr: addr,
		DB:   "x",
		User: "default",
	})
	require.Error(t, err)
}
