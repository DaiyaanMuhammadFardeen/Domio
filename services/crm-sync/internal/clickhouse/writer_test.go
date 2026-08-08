package clickhouse

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNewWriterBadURL(t *testing.T) {
	_, err := NewWriter(Config{URL: ""})
	require.Error(t, err)
}

func TestNewWriterPings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.RawQuery, "query=SELECT") {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	w, err := NewWriter(Config{URL: srv.URL})
	require.NoError(t, err)
	require.NotNil(t, w)
}

func TestNewWriterPingFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	defer srv.Close()
	_, err := NewWriter(Config{URL: srv.URL})
	require.Error(t, err)
}

func TestInsertEmpty(t *testing.T) {
	w := &Writer{}
	require.NoError(t, w.Insert(context.Background(), nil))
}

func TestInsertRoundTrip(t *testing.T) {
	var gotBody string
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	w, err := NewWriter(Config{URL: srv.URL})
	require.NoError(t, err)
	now := time.Now().UTC()
	synced := now.Add(time.Millisecond)
	next := now.Add(5 * time.Second)
	err = w.Insert(context.Background(), []Record{{
		SyncID:         "11111111-1111-1111-1111-111111111111",
		WorkspaceID:    "w-1",
		ConnectionID:   "22222222-2222-2222-2222-222222222222",
		ViewerIDKey:    "v-1",
		EventID:        "e-1",
		EventName:      "view",
		State:          "success",
		Attempts:       1,
		LastError:      "",
		SyncedAt:       &synced,
		NextRetryAt:    &next,
		CreatedAt:      now,
		IdempotencyKey: "abc",
		Provider:       "hubspot",
	}})
	require.NoError(t, err)
	require.Contains(t, gotBody, "w-1")
	require.Contains(t, gotBody, "view")
	require.Contains(t, gotBody, "abc")
	require.Contains(t, gotBody, "hubspot")
	require.Contains(t, gotQuery, "INSERT")
	require.Contains(t, gotQuery, "crm_sync_record")
}

func TestInsertServerError(t *testing.T) {
	pingSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.RawQuery, "query=SELECT") {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("bad"))
	}))
	defer pingSrv.Close()
	w, err := NewWriter(Config{URL: pingSrv.URL})
	require.NoError(t, err)
	err = w.Insert(context.Background(), []Record{{WorkspaceID: "w"}})
	require.Error(t, err)
	require.Contains(t, err.Error(), "400")
}

func TestUrlQuery(t *testing.T) {
	require.Equal(t, "hello", urlQuery("hello"))
	require.Equal(t, "hello%20world", urlQuery("hello world"))
	require.Equal(t, "a%26b", urlQuery("a&b"))
	require.Equal(t, "a%3Db", urlQuery("a=b"))
}
