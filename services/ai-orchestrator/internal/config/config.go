// Package config provides configuration loading for the AI orchestrator service.
// All configuration is driven by environment variables with sensible defaults.
package config

import "os"

// Config holds all configuration for the AI orchestrator.
type Config struct {
	Port         string
	OTLPEndpoint string
	DatabaseURL  string
	NATSURL      string
	RedisURL     string
	JWTSecret    string

	// AI provider settings.
	DefaultProvider         string // openai | anthropic | local
	MaxCostPerReq           float64
	CircuitBreakerThreshold int
	ModerationEnabled       bool

	// Planner settings.
	MaxDecompositionDepth int
}

// Load reads configuration from the environment. Missing values fall back
// to production-ready defaults.
func Load() Config {
	return Config{
		Port:         getEnv("PORT", "8090"),
		OTLPEndpoint: getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
		DatabaseURL:  getEnv("DATABASE_URL", getEnv("POSTGRES_URL", "")),
		NATSURL:      getEnv("NATS_URL", "nats://localhost:4222"),
		RedisURL:     getEnv("REDIS_URL", ""),
		JWTSecret:    getEnv("JWT_SECRET", ""),

		DefaultProvider:         getEnv("AI_DEFAULT_PROVIDER", "openai"),
		MaxCostPerReq:           1.0,
		CircuitBreakerThreshold: 5,
		ModerationEnabled:       getEnv("AI_MODERATION_ENABLED", "true") == "true",

		MaxDecompositionDepth: 3,
	}
}

// getEnv reads an environment variable and returns the fallback if unset or empty.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
