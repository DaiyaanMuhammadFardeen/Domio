package secretbroker

import (
	"context"
	"errors"
	"os"
	"testing"
)

func TestEnvBrokerGet(t *testing.T) {
	t.Setenv("TEST_SECRET_KEY", "test-value-123")

	b := NewEnvBroker()
	val, err := b.Get(context.Background(), "TEST_SECRET_KEY")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if val != "test-value-123" {
		t.Errorf("Get = %q, want test-value-123", val)
	}
}

func TestEnvBrokerGetMissing(t *testing.T) {
	b := NewEnvBroker()
	_, err := b.Get(context.Background(), "DEFINITELY_NOT_SET_VAR_XYZ")
	if err == nil {
		t.Fatal("expected error for missing env var")
	}
	if !errors.Is(err, ErrNotConfigured) {
		t.Errorf("err = %v, want ErrNotConfigured", err)
	}
}

func TestEnvBrokerWellKnownKeys(t *testing.T) {
	tests := []struct {
		key string
		val string
	}{
		{KeyOpenAI, "sk-openai-test"},
		{KeyAnthropic, "sk-ant-test"},
		{KeyGoogleAI, "google-ai-test"},
		{KeyVLLMBase, "http://localhost:8080"},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			t.Setenv(tt.key, tt.val)
			b := NewEnvBroker()
			got, err := b.Get(context.Background(), tt.key)
			if err != nil {
				t.Fatalf("Get: %v", err)
			}
			if got != tt.val {
				t.Errorf("Get = %q, want %q", got, tt.val)
			}
		})
	}
}

func TestVaultBrokerReturnsNotConfigured(t *testing.T) {
	b := NewVaultBroker()
	_, err := b.Get(context.Background(), "any-key")
	if !errors.Is(err, ErrNotConfigured) {
		t.Errorf("err = %v, want ErrNotConfigured", err)
	}
}

func TestEnvBrokerEmptyValue(t *testing.T) {
	os.Setenv("EMPTY_SECRET_KEY", "")
	defer os.Unsetenv("EMPTY_SECRET_KEY")

	b := NewEnvBroker()
	_, err := b.Get(context.Background(), "EMPTY_SECRET_KEY")
	if err == nil {
		t.Fatal("expected error for empty env var")
	}
	if !errors.Is(err, ErrNotConfigured) {
		t.Errorf("err = %v, want ErrNotConfigured", err)
	}
}
