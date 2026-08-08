package main

import (
	"encoding/json"
	"net"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/clickhouse"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// healthResponse is the JSON shape returned by GET /healthz.
type healthResponse struct {
	OK       bool     `json:"ok"`
	Providers []string `json:"providers"`
}

// startHealthServer brings up a tiny HTTP server with /healthz
// (lists the registered providers) and /readyz (returns 200 only
// if the ClickHouse writer is wired).
func startHealthServer(addr string, reg *registry.Registry, ch *clickhouse.Writer) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		out := healthResponse{OK: true, Providers: reg.Providers()}
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		if ch == nil {
			http.Error(w, "clickhouse not configured", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	srv := &http.Server{
		Addr:              net.JoinHostPort("", addr),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			zap.L().Warn("crm-sync: health server error", zap.Error(err))
		}
	}()
	return srv
}
