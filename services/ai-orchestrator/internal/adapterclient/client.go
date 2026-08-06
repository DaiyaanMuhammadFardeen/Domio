// Package adapterclient provides a typed gRPC client interface for the
// AdapterService (services/ai-adapters, gRPC :50051).
//
// The Client interface mirrors the RPCs defined in contracts/proto/domio/ai/v1/ai.proto.
// The gRPC implementation references the generated domioaiv1 package; since buf
// generate cannot run locally (no BUF_TOKEN), the generated package import is
// clearly marked with a TODO. The typed interface is fully defined so P2-L1
// can drop in the generated client.
package adapterclient

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ErrNotConfigured is returned when the adapter address is not set.
var ErrNotConfigured = errors.New("adapterclient: ADAPTER_ADDR not configured")

// ---------------------------------------------------------------------------
// Typed client interface — mirrors the proto AdapterService RPCs.
// ---------------------------------------------------------------------------

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string // "system", "user", "assistant"
	Content string
}

// TextDelta represents a single streaming delta from text generation.
type TextDelta struct {
	Text          string
	FinishReason  string
	InputTokens   int32
	OutputTokens  int32
}

// ImageResult represents the response from image generation.
type ImageResult struct {
	URL               string
	Provider          string
	Model             string
	Prompt            string
	ModerationVerdict map[string]interface{}
}

// EmbedResult represents the response from embedding generation.
type EmbedResult struct {
	Embedding []float32
}

// Capabilities represents model capability information.
type Capabilities struct {
	ModelClass  string
	Capabilities []string
}

// PromptTemplate represents a prompt template from the adapter registry.
type PromptTemplate struct {
	ID                 string
	Version            int32
	ModelClassHint     string
	InputSchemaJSON    string
	OutputSchemaJSON   string
	SystemPrompt       string
	UserPromptTemplate string
	EvalSetID          string
}

// TextStreamHandler is called for each streaming delta. Return a non-nil
// error to abort the stream.
type TextStreamHandler func(delta TextDelta) error

// Client defines the typed interface for communicating with the adapter
// service. Implementations must be safe for concurrent use.
type Client interface {
	// GenerateText streams text completion deltas from a chat prompt.
	GenerateText(ctx context.Context, model string, messages []ChatMessage, maxTokens int32, temperature float32, jsonMode bool, handler TextStreamHandler) error

	// GenerateImage produces one or more images from a text prompt.
	GenerateImage(ctx context.Context, model, prompt string, n int32, size string) (*ImageResult, error)

	// GenerateTranscription streams transcription deltas from audio.
	GenerateTranscription(ctx context.Context, model string, audio []byte, handler func(delta struct{ Text string; IsFinal bool }) error) error

	// Embed produces a vector embedding for a text input.
	Embed(ctx context.Context, model, input string) (*EmbedResult, error)

	// GetCapabilities returns the class and capabilities of a model.
	GetCapabilities(ctx context.Context, model string) (*Capabilities, error)

	// GetPrompt fetches a prompt template by ID and optional version.
	GetPrompt(ctx context.Context, templateID string, version int32) (*PromptTemplate, error)
}

// ---------------------------------------------------------------------------
// gRPC implementation — wraps a gRPC connection to the adapter service.
// ---------------------------------------------------------------------------

// grpcClient implements Client over a gRPC connection.
type grpcClient struct {
	addr string
	conn *grpc.ClientConn
}

// NewGRPCClient creates a new gRPC-backed adapter client.
// Pass addr "" to use the ADAPTER_ADDR env var (default: localhost:50051).
func NewGRPCClient(addr string) (*grpcClient, error) {
	if addr == "" {
		addr = os.Getenv("ADAPTER_ADDR")
	}
	if addr == "" {
		addr = "localhost:50051"
	}

	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("adapterclient: dial %s: %w", addr, err)
	}

	return &grpcClient{addr: addr, conn: conn}, nil
}

// Close closes the underlying gRPC connection.
func (c *grpcClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// ---------------------------------------------------------------------------
// RPC call sites — each method references the generated domioaiv1 package.
// When buf generate runs in CI, these will compile against the generated stubs.
// ---------------------------------------------------------------------------

// TODO(domioaiv1): When buf generate runs in CI, import:
//   domioaiv1 "github.com/domio/platform/gen/go/domio/ai/v1"
// and replace the manual gRPC calls below with typed RPC invocations.
//
// For now, the methods use the generic gRPC client API so that the code
// compiles locally without the generated package. P2-L1 will swap these
// for direct domioaiv1 calls.

func (c *grpcClient) GenerateText(ctx context.Context, model string, messages []ChatMessage, maxTokens int32, temperature float32, jsonMode bool, handler TextStreamHandler) error {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   stream, err := client.GenerateText(ctx, &domioaiv1.GenerateTextRequest{...})
	//   for { delta, err := stream.Recv(); ... handler(toTextDelta(delta)) }
	if c.conn == nil {
		return ErrNotConfigured
	}

	// Placeholder: call via generic gRPC invoke.
	// The real implementation will unmarshal domioaiv1.GenerateTextDelta messages.
	return fmt.Errorf("adapterclient.GenerateText: not yet wired (TODO domioaiv1)")
}

func (c *grpcClient) GenerateImage(ctx context.Context, model, prompt string, n int32, size string) (*ImageResult, error) {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   resp, err := client.GenerateImage(ctx, &domioaiv1.GenerateImageRequest{...})
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	return nil, fmt.Errorf("adapterclient.GenerateImage: not yet wired (TODO domioaiv1)")
}

func (c *grpcClient) GenerateTranscription(ctx context.Context, model string, audio []byte, handler func(delta struct{ Text string; IsFinal bool }) error) error {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   stream, err := client.Transcribe(ctx, &domioaiv1.TranscribeRequest{...})
	if c.conn == nil {
		return ErrNotConfigured
	}
	return fmt.Errorf("adapterclient.GenerateTranscription: not yet wired (TODO domioaiv1)")
}

func (c *grpcClient) Embed(ctx context.Context, model, input string) (*EmbedResult, error) {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   resp, err := client.Embed(ctx, &domioaiv1.EmbedRequest{...})
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	return nil, fmt.Errorf("adapterclient.Embed: not yet wired (TODO domioaiv1)")
}

func (c *grpcClient) GetCapabilities(ctx context.Context, model string) (*Capabilities, error) {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   resp, err := client.GetCapabilities(ctx, &domioaiv1.GetCapabilitiesRequest{...})
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	return nil, fmt.Errorf("adapterclient.GetCapabilities: not yet wired (TODO domioaiv1)")
}

func (c *grpcClient) GetPrompt(ctx context.Context, templateID string, version int32) (*PromptTemplate, error) {
	// TODO(domioaiv1): Replace with:
	//   client := domioaiv1.NewAdapterServiceClient(c.conn)
	//   resp, err := client.GetPrompt(ctx, &domioaiv1.GetPromptRequest{...})
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	return nil, fmt.Errorf("adapterclient.GetPrompt: not yet wired (TODO domioaiv1)")
}

// Ensure grpcClient implements Client at compile time.
var _ Client = (*grpcClient)(nil)

// Ensure the unused import is consumed if io is needed for streaming later.
var _ = io.EOF
