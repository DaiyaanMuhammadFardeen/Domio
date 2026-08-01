// Package main is the entrypoint for the realtime gateway service.
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"github.com/domio/platform/services/realtime-gateway/internal/hlc"
	"github.com/domio/platform/services/realtime-gateway/internal/observability"
	"github.com/domio/platform/services/realtime-gateway/internal/router"
	"github.com/domio/platform/services/realtime-gateway/internal/session"
)

func main() {
	// ─── Configuration from environment ───────────────────────────────
	port := getEnv("PORT", "8080")
	natsURL := getEnv("NATS_URL", "nats://localhost:4222")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	postgresURL := getEnv("POSTGRES_URL", "")
	jwtSecret := getEnv("JWT_SECRET", "")
	jwksURL := getEnv("JWT_JWKS_URL", "")
	otlpEndpoint := getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	gatewayID := getEnv("GATEWAY_ID", "rtgw-1")

	_ = natsURL
	_ = redisAddr
	_ = postgresURL
	_ = jwtSecret
	_ = jwksURL

	// ─── Logger ────────────────────────────────────────────────────────
	logger, err := observability.NewLogger()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("rtgw: starting",
		zap.String("gateway_id", gatewayID),
		zap.String("port", port))

	// ─── Tracing ──────────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	shutdownTracer, err := observability.InitTracer(ctx, "rtgw", otlpEndpoint)
	if err != nil {
		logger.Fatal("otel init failed", zap.Error(err))
	}
	defer shutdownTracer(context.Background())

	// ─── HLC clock ────────────────────────────────────────────────────
	_ = hlc.New()

	// ─── Session store ────────────────────────────────────────────────
	sessStore := session.NewMemorySessionStore()

	// ─── Router ───────────────────────────────────────────────────────
	upgrader := &websocket.Upgrader{
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	cfg := router.Config{
		Logger:    logger,
		Sessions:  sessStore,
		GatewayID: gatewayID,
		Upgrader:  upgrader,
	}
	r := router.New(cfg)

	// ─── HTTP server ──────────────────────────────────────────────────
	srv := &http.Server{
		Addr:              net.JoinHostPort("0.0.0.0", port),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// ─── Graceful shutdown ────────────────────────────────────────────
	errCh := make(chan error, 1)
	go func() {
		logger.Info("rtgw: listening", zap.String("addr", srv.Addr))
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		logger.Info("rtgw: shutting down", zap.String("signal", sig.String()))
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("rtgw: server error", zap.Error(err))
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("rtgw: shutdown error", zap.Error(err))
	}

	logger.Info("rtgw: stopped")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
