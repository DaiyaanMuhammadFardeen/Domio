// Package main is the entrypoint for the Domio MCP server (Phase 13 M1).
//
// The M1 server exposes a JSON-RPC 2.0 gateway over HTTPS with:
//   - 6 read-only tools (lint_deck, get_provenance, semantic_search,
//     get_claim_confidence, accessibility_audit, check_freshness).
//   - capability-scoped bearer-token auth (read:deck, lint:deck, etc).
//   - hash-chained audit log (HMAC-SHA256, prev_hash linkage).
//   - SSE streaming transport for long-running responses.
//
// M2 will add write tools (NL patch, image gen, etc.) and the agent
// runtime (M3). The audit chain format and the capability registry
// already in M1 are designed to absorb those without breakage.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/domio/platform/services/mcp-server/internal/audit"
	"github.com/domio/platform/services/mcp-server/internal/auth"
	"github.com/domio/platform/services/mcp-server/internal/gateway"
	"github.com/domio/platform/services/mcp-server/internal/registry"
	"github.com/domio/platform/services/mcp-server/internal/store"
	"github.com/domio/platform/services/mcp-server/internal/tools"
)

// ---------------------------------------------------------------------------
// Configuration (env vars)
// ---------------------------------------------------------------------------

type config struct {
	Port         string
	DatabaseURL  string
	AuditKeyHex  string // hex-encoded 32-byte HMAC key, REQUIRED
	StaticTokens string // "token:subject:scope1,scope2;…" (dev only)
}

func loadConfig() (config, error) {
	c := config{
		Port:        getEnv("PORT", "8086"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		AuditKeyHex: os.Getenv("AUDIT_HMAC_KEY"),
		StaticTokens: os.Getenv("MCP_STATIC_TOKENS"),
	}
	if c.AuditKeyHex == "" {
		return c, errors.New("AUDIT_HMAC_KEY is required (32-byte hex)")
	}
	if len(c.AuditKeyHex) != audit.HMACKeyBytes*2 {
		return c, fmt.Errorf("AUDIT_HMAC_KEY must be %d hex chars", audit.HMACKeyBytes*2)
	}
	return c, nil
}

func getEnv(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

// ---------------------------------------------------------------------------
// Static-token authenticator (dev only — production uses mcp_session lookup)
// ---------------------------------------------------------------------------

type staticAuth struct {
	tokens map[string]*auth.Principal
}

func parseStaticTokens(spec string) map[string]*auth.Principal {
	out := map[string]*auth.Principal{}
	if spec == "" {
		return out
	}
	for _, entry := range strings.Split(spec, ";") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.Split(entry, ":")
		if len(parts) < 3 {
			continue
		}
		token := parts[0]
		subject := parts[1]
		workspace := parts[2]
		var scopes map[auth.CapabilityScope]struct{}
		if len(parts) >= 4 {
			scopes = map[auth.CapabilityScope]struct{}{}
			for _, s := range strings.Split(parts[3], ",") {
				s = strings.TrimSpace(s)
				if s != "" {
					scopes[auth.CapabilityScope(s)] = struct{}{}
				}
			}
		}
		out[token] = &auth.Principal{
			SubjectID:   subject,
			WorkspaceID: workspace,
			Scopes:      scopes,
		}
	}
	return out
}

func (s *staticAuth) Authenticate(_ context.Context, token string) (*auth.Principal, error) {
	p, ok := s.tokens[token]
	if !ok {
		return nil, fmt.Errorf("mcp-server: unknown token")
	}
	return p, nil
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

func main() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ─── Database (optional) ────────────────────────────────────────────
	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		p, err := pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			fmt.Fprintf(os.Stderr, "pgxpool connect failed: %v\n", err)
			os.Exit(1)
		}
		if err := p.Ping(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "pgxpool ping failed: %v\n", err)
			os.Exit(1)
		}
		defer p.Close()
		pool = p
		fmt.Println("mcp-server: connected to postgres")
	} else {
		fmt.Println("mcp-server: no DATABASE_URL — using in-memory store (dev/test only)")
	}

	// ─── Audit chain ───────────────────────────────────────────────────
	chain, err := audit.NewChain([]audit.Key{{
		Kid:          "k1",
		KeyHex:       cfg.AuditKeyHex,
		RotatedAt:    time.Now().UTC().Add(-1 * time.Hour),
		ExpiresAt:    time.Now().UTC().Add(90 * 24 * time.Hour),
		OverlapUntil: time.Now().UTC().Add(7 * 24 * time.Hour),
	}})
	if err != nil {
		fmt.Fprintf(os.Stderr, "audit init failed: %v\n", err)
		os.Exit(1)
	}

	// ─── Store (audit-event persistence) ───────────────────────────────
	var auditSink gateway.AuditSink
	if pool != nil {
		pgxStore := store.New(pool)
		auditSink = &gateway.ChainAuditSink{
			Chain: chain,
			Persist: func(ctx context.Context, ev audit.Event) error {
				return pgxStore.InsertAuditEvent(ctx, &ev)
			},
		}
	} else {
		// No DB — use a no-op sink so we still record in-memory.
		mem := store.NewMemStore()
		auditSink = &gateway.ChainAuditSink{
			Chain: chain,
			Persist: func(ctx context.Context, ev audit.Event) error {
				return mem.InsertAuditEvent(ctx, &ev)
			},
		}
	}

	// ─── Auth ──────────────────────────────────────────────────────────
	authn := &staticAuth{tokens: parseStaticTokens(cfg.StaticTokens)}
	if len(authn.tokens) == 0 {
		// Seed a dev token so the service is usable out-of-the-box.
		devToken := "dev-token-do-not-use-in-prod"
		tokHash := sha256Hex(devToken)
		_ = tokHash // not used with staticAuth; the token comparison is direct
		authn.tokens[devToken] = &auth.Principal{
			SubjectID:   "dev",
			WorkspaceID: "00000000-0000-0000-0000-000000000001",
			Scopes: map[auth.CapabilityScope]struct{}{
				auth.ScopeReadDeck:   {},
				auth.ScopeLintDeck:   {},
				auth.ScopeSearchDeck: {},
				auth.ScopeAuditRead:  {},
				auth.ScopeClaimRead:  {},
				auth.ScopeA11yRun:    {},
			},
		}
		fmt.Println("mcp-server: seeded dev token 'dev-token-do-not-use-in-prod' (DO NOT USE IN PROD)")
	}

	// ─── Registry ──────────────────────────────────────────────────────
	reg := registry.New()
	for _, spec := range tools.AllTools() {
		if err := reg.Register(spec); err != nil {
			fmt.Fprintf(os.Stderr, "register %s: %v\n", spec.Name, err)
			os.Exit(1)
		}
	}

	// ─── Gateway ───────────────────────────────────────────────────────
	gw, err := gateway.New(gateway.Config{
		Authenticator: authn,
		Registry:      reg,
		Audit:         auditSink,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gateway init failed: %v\n", err)
		os.Exit(1)
	}

	// ─── HTTP server ───────────────────────────────────────────────────
	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           gw.Router(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		fmt.Printf("mcp-server: listening on :%s\n", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "listen: %v\n", err)
			os.Exit(1)
		}
	}()

	<-stop
	fmt.Println("\nmcp-server: shutting down")
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "shutdown: %v\n", err)
	}
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}