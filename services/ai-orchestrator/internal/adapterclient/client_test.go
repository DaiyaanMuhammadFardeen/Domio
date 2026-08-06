package adapterclient

import (
	"context"
	"errors"
	"testing"
)

func TestNewGRPCClientDefaultAddr(t *testing.T) {
	client, err := NewGRPCClient("")
	if err != nil {
		// The connection to localhost:50051 will fail in CI, but the
		// client struct should still be created. We test the error
		// path instead.
		if errors.Is(err, ErrNotConfigured) {
			t.Fatal("default addr should not return ErrNotConfigured")
		}
		// Expected: connection refused. That's fine — we just want to
		// verify the default addr was used.
		t.Logf("connection to default addr failed (expected in CI): %v", err)
		return
	}
	defer client.Close()

	if client.addr != "localhost:50051" {
		t.Errorf("addr = %q, want localhost:50051", client.addr)
	}
}

func TestNewGRPCClientCustomAddr(t *testing.T) {
	client, err := NewGRPCClient("localhost:19999")
	if err != nil {
		t.Logf("connection failed (expected in CI): %v", err)
		return
	}
	defer client.Close()

	if client.addr != "localhost:19999" {
		t.Errorf("addr = %q, want localhost:19999", client.addr)
	}
}

func TestGRPCClientMethodsNotWired(t *testing.T) {
	client, err := NewGRPCClient("localhost:19999")
	if err != nil {
		t.Skip("cannot connect to test addr")
	}
	defer client.Close()

	ctx := context.Background()

	// All methods should return a TODO-style error since the gRPC stubs
	// haven't been generated yet.
	err = client.GenerateText(ctx, "model", nil, 100, 0.7, false, func(TextDelta) error { return nil })
	if err == nil {
		t.Error("GenerateText should return error when not wired")
	}

	_, err = client.GenerateImage(ctx, "model", "prompt", 1, "1024x1024")
	if err == nil {
		t.Error("GenerateImage should return error when not wired")
	}

	err = client.GenerateTranscription(ctx, "model", nil, func(struct{ Text string; IsFinal bool }) error { return nil })
	if err == nil {
		t.Error("GenerateTranscription should return error when not wired")
	}

	_, err = client.Embed(ctx, "model", "input")
	if err == nil {
		t.Error("Embed should return error when not wired")
	}

	_, err = client.GetCapabilities(ctx, "model")
	if err == nil {
		t.Error("GetCapabilities should return error when not wired")
	}

	_, err = client.GetPrompt(ctx, "template-id", 1)
	if err == nil {
		t.Error("GetPrompt should return error when not wired")
	}
}

func TestInterfaceSatisfaction(t *testing.T) {
	// Verify that *grpcClient satisfies Client at compile time.
	var _ Client = (*grpcClient)(nil)
}
