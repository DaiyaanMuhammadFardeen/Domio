// Command pwg is the participant WS gateway entrypoint.
//
// Phase 16 W1. Mirrors services/realtime-gateway/cmd/rtgw/main.go.
//
// Environment:
//
//	PORT            — listen port (default 8090)
//	SHARD_COUNT     — number of audience shards (default 1024)
//	JOIN_PEPPER_*   — workspace_id → hex pepper, e.g.
//	                  JOIN_PEPPER_default=00112233...
//
// The gateway speaks WebSocket on /v1/audience/ws and exposes
// /healthz + /metrics for ops.
package main

import (
	"context"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/domio/platform/services/participant-ws-gateway/internal/bus"
	"github.com/domio/platform/services/participant-ws-gateway/internal/hlc"
	"github.com/domio/platform/services/participant-ws-gateway/internal/observability"
	"github.com/domio/platform/services/participant-ws-gateway/internal/router"
	"github.com/domio/platform/services/participant-ws-gateway/internal/session"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	port := getEnv("PORT", "8090")
	shards := parseInt(getEnv("SHARD_COUNT", "1024"))

	metrics := observability.New()
	rec := observability.NewRecorder(metrics)
	promHandler := promhttp.HandlerFor(metrics.Registry(), promhttp.HandlerOpts{})

	rt := router.New(router.Config{
		Bus:             bus.New(),
		HLC:             hlc.New(nil),
		Registry:        session.New(),
		Peppers:         loadPeppers(),
		JoinShards:      shards,
		MetricsHandler:  promHandler,
		Metrics:         rec,
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           rt,
		ReadHeaderTimeout: 5 * time.Second,
	}

	idleClosed := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idleClosed)
	}()

	log.Printf("pwg listening on :%s (shards=%d)", port, shards)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("pwg: %v", err)
	}
	<-idleClosed
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func parseInt(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return 1024
	}
	return n
}

func loadPeppers() map[string][]byte {
	out := map[string][]byte{}
	for _, kv := range os.Environ() {
		idx := strings.IndexByte(kv, '=')
		if idx <= 0 || !strings.HasPrefix(kv[:idx], "JOIN_PEPPER_") {
			continue
		}
		ws := kv[:idx][len("JOIN_PEPPER_"):]
		hexVal := kv[idx+1:]
		b, err := hex.DecodeString(hexVal)
		if err != nil {
			continue
		}
		out[ws] = b
	}
	return out
}