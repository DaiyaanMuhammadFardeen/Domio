package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Clear any env vars that might influence the test.
	keys := []string{
		"PORT", "OTEL_EXPORTER_OTLP_ENDPOINT", "DATABASE_URL", "POSTGRES_URL",
		"NATS_URL", "REDIS_URL", "JWT_SECRET", "AI_DEFAULT_PROVIDER",
		"AI_MODERATION_ENABLED",
	}
	for _, k := range keys {
		t.Setenv(k, "")
	}

	cfg := Load()

	if cfg.Port != "8090" {
		t.Errorf("default Port = %q, want %q", cfg.Port, "8090")
	}
	if cfg.OTLPEndpoint != "" {
		t.Errorf("default OTLPEndpoint = %q, want empty", cfg.OTLPEndpoint)
	}
	if cfg.DefaultProvider != "openai" {
		t.Errorf("default DefaultProvider = %q, want %q", cfg.DefaultProvider, "openai")
	}
	if cfg.MaxCostPerReq != 1.0 {
		t.Errorf("default MaxCostPerReq = %v, want %v", cfg.MaxCostPerReq, 1.0)
	}
	if cfg.CircuitBreakerThreshold != 5 {
		t.Errorf("default CircuitBreakerThreshold = %v, want %v", cfg.CircuitBreakerThreshold, 5)
	}
	if !cfg.ModerationEnabled {
		t.Error("default ModerationEnabled = false, want true")
	}
	if cfg.MaxDecompositionDepth != 3 {
		t.Errorf("default MaxDecompositionDepth = %v, want %v", cfg.MaxDecompositionDepth, 3)
	}
}

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("PORT", "9999")
	t.Setenv("AI_DEFAULT_PROVIDER", "anthropic")
	t.Setenv("AI_MODERATION_ENABLED", "false")
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")

	cfg := Load()

	if cfg.Port != "9999" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9999")
	}
	if cfg.DefaultProvider != "anthropic" {
		t.Errorf("DefaultProvider = %q, want %q", cfg.DefaultProvider, "anthropic")
	}
	if cfg.ModerationEnabled {
		t.Error("ModerationEnabled = true, want false")
	}
	if cfg.DatabaseURL != "postgres://test:test@localhost/test" {
		t.Errorf("DatabaseURL = %q, want correct URL", cfg.DatabaseURL)
	}
}

func TestLoadPostgresURLFallback(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("POSTGRES_URL", "postgres://fallback/test")

	cfg := Load()

	if cfg.DatabaseURL != "postgres://fallback/test" {
		t.Errorf("DatabaseURL = %q, want postgres://fallback/test", cfg.DatabaseURL)
	}
}

func TestGetEnv(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		fallback string
		envVal   string
		want     string
	}{
		{
			name:     "env set",
			key:      "TEST_GETENV_SET",
			fallback: "default",
			envVal:   "from_env",
			want:     "from_env",
		},
		{
			name:     "env empty uses fallback",
			key:      "TEST_GETENV_EMPTY",
			fallback: "default",
			envVal:   "",
			want:     "default",
		},
		{
			name:     "env unset uses fallback",
			key:      "TEST_GETENV_UNSET_NONEXISTENT_XYZ",
			fallback: "default",
			envVal:   "",
			want:     "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				os.Setenv(tt.key, tt.envVal)
				defer os.Unsetenv(tt.key)
			}
			got := getEnv(tt.key, tt.fallback)
			if got != tt.want {
				t.Errorf("getEnv(%q, %q) = %q, want %q", tt.key, tt.fallback, got, tt.want)
			}
		})
	}
}
