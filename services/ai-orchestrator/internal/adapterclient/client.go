// Package adapterclient provides a typed gRPC client interface for the
// AdapterService (services/ai-adapters, gRPC :50051).
//
// The Client interface mirrors the RPCs defined in contracts/proto/domio/ai/v1/ai.proto.
// The gRPC implementation now uses the generated domioaiv1 package (produced
// by `buf generate` with protoc-gen-go and protoc-gen-go-grpc). See
// buf.gen.local.yaml for the local fallback used when no BUF_TOKEN is set.
package adapterclient

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"

	domioaiv1 "github.com/domio/platform/gen/go/domio/ai/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ErrStreamDone is returned by stream Recv when the peer closes the stream.
var ErrStreamDone = io.EOF

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
	Text         string
	FinishReason string
	InputTokens  int32
	OutputTokens int32
}

// ImageResult represents the response from image generation.
type ImageResult struct {
	URL               string
	Provider          string
	Model             string
	Prompt            string
	ModerationVerdict map[string]interface{}
}

// TranscribeDelta represents a streaming delta from transcription.
type TranscribeDelta struct {
	Text    string
	IsFinal bool
}

// EmbedResult represents the response from embedding generation.
type EmbedResult struct {
	Embedding []float32
}

// Capabilities represents model capability information.
type Capabilities struct {
	ModelClass   string
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

// TranscribeStreamHandler is called for each transcription delta.
type TranscribeStreamHandler func(delta TranscribeDelta) error

// Client defines the typed interface for communicating with the adapter
// service. Implementations must be safe for concurrent use.
type Client interface {
	// GenerateText streams text completion deltas from a chat prompt.
	GenerateText(ctx context.Context, model string, messages []ChatMessage, maxTokens int32, temperature float32, jsonMode bool, handler TextStreamHandler) error

	// GenerateImage produces one or more images from a text prompt.
	GenerateImage(ctx context.Context, model, prompt string, n int32, size string) (*ImageResult, error)

	// GenerateTranscription streams transcription deltas from audio.
	GenerateTranscription(ctx context.Context, model string, audio []byte, handler TranscribeStreamHandler) error

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

// grpcClient implements Client over a gRPC connection using the typed
// stubs from contracts/proto/domio/ai/v1/ai.proto.
type grpcClient struct {
	addr   string
	conn   *grpc.ClientConn
	ai     domioaiv1.AdapterServiceClient
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

	return &grpcClient{
		addr: addr,
		conn: conn,
		ai:   domioaiv1.NewAdapterServiceClient(conn),
	}, nil
}

// Close closes the underlying gRPC connection.
func (c *grpcClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// ---------------------------------------------------------------------------
// RPC call sites — typed against domioaiv1 (contracts/proto/domio/ai/v1).
// ---------------------------------------------------------------------------

func toProtoMessage(m ChatMessage) *domioaiv1.ChatMessage {
	var role domioaiv1.MessageRole
	switch m.Role {
	case "system":
		role = domioaiv1.MessageRole_MESSAGE_ROLE_SYSTEM
	case "assistant":
		role = domioaiv1.MessageRole_MESSAGE_ROLE_ASSISTANT
	default:
		role = domioaiv1.MessageRole_MESSAGE_ROLE_USER
	}
	return &domioaiv1.ChatMessage{
		Role:    role,
		Content: m.Content,
	}
}

func fromProtoFinishReason(r domioaiv1.FinishReason) string {
	return r.String()
}

func fromProtoModeration(s interface{}) map[string]interface{} {
	// domioaiv1.GenerateImageResponse.ModerationVerdict is a *structpb.Struct.
	// We map it back to a plain map for downstream consumers.
	type structUnwrap interface {
		AsMap() map[string]interface{}
	}
	if s == nil {
		return nil
	}
	if u, ok := s.(structUnwrap); ok {
		return u.AsMap()
	}
	return nil
}

func (c *grpcClient) GenerateText(ctx context.Context, model string, messages []ChatMessage, maxTokens int32, temperature float32, jsonMode bool, handler TextStreamHandler) error {
	if c.conn == nil {
		return ErrNotConfigured
	}
	protoMessages := make([]*domioaiv1.ChatMessage, len(messages))
	for i, m := range messages {
		protoMessages[i] = toProtoMessage(m)
	}
	stream, err := c.ai.GenerateText(ctx, &domioaiv1.GenerateTextRequest{
		Model:       model,
		Messages:    protoMessages,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		JsonMode:    jsonMode,
	})
	if err != nil {
		return fmt.Errorf("adapterclient.GenerateText: %w", err)
	}
	for {
		delta, err := stream.Recv()
		if err != nil {
			if errors.Is(err, ErrStreamDone) {
				return nil
			}
			return fmt.Errorf("adapterclient.GenerateText: stream recv: %w", err)
		}
		if delta == nil {
			return nil
		}
		if handler != nil {
			if err := handler(TextDelta{
				Text:         delta.GetText(),
				FinishReason: fromProtoFinishReason(delta.GetFinishReason()),
				InputTokens:  delta.GetInputTokens(),
				OutputTokens: delta.GetOutputTokens(),
			}); err != nil {
				return err
			}
		}
	}
}

func (c *grpcClient) GenerateImage(ctx context.Context, model, prompt string, n int32, size string) (*ImageResult, error) {
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	resp, err := c.ai.GenerateImage(ctx, &domioaiv1.GenerateImageRequest{
		Model:  model,
		Prompt: prompt,
		N:      n,
		Size:   size,
	})
	if err != nil {
		return nil, fmt.Errorf("adapterclient.GenerateImage: %w", err)
	}
	return &ImageResult{
		URL:               resp.GetUrl(),
		Provider:          resp.GetProvider(),
		Model:             resp.GetModel(),
		Prompt:            resp.GetPrompt(),
		ModerationVerdict: fromProtoModeration(resp.GetModerationVerdict()),
	}, nil
}

func (c *grpcClient) GenerateTranscription(ctx context.Context, model string, audio []byte, handler TranscribeStreamHandler) error {
	if c.conn == nil {
		return ErrNotConfigured
	}
	stream, err := c.ai.Transcribe(ctx, &domioaiv1.TranscribeRequest{
		Model: model,
		Audio: audio,
	})
	if err != nil {
		return fmt.Errorf("adapterclient.GenerateTranscription: %w", err)
	}
	for {
		delta, err := stream.Recv()
		if err != nil {
			if errors.Is(err, ErrStreamDone) {
				return nil
			}
			return fmt.Errorf("adapterclient.GenerateTranscription: stream recv: %w", err)
		}
		if delta == nil {
			return nil
		}
		if handler != nil {
			if err := handler(TranscribeDelta{
				Text:    delta.GetText(),
				IsFinal: delta.GetIsFinal(),
			}); err != nil {
				return err
			}
		}
	}
}

func (c *grpcClient) Embed(ctx context.Context, model, input string) (*EmbedResult, error) {
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	resp, err := c.ai.Embed(ctx, &domioaiv1.EmbedRequest{
		Model: model,
		Input: input,
	})
	if err != nil {
		return nil, fmt.Errorf("adapterclient.Embed: %w", err)
	}
	return &EmbedResult{Embedding: resp.GetEmbedding()}, nil
}

func (c *grpcClient) GetCapabilities(ctx context.Context, model string) (*Capabilities, error) {
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	resp, err := c.ai.GetCapabilities(ctx, &domioaiv1.GetCapabilitiesRequest{
		Model: model,
	})
	if err != nil {
		return nil, fmt.Errorf("adapterclient.GetCapabilities: %w", err)
	}
	return &Capabilities{
		ModelClass:   resp.GetModelClass(),
		Capabilities: resp.GetCapabilities(),
	}, nil
}

func (c *grpcClient) GetPrompt(ctx context.Context, templateID string, version int32) (*PromptTemplate, error) {
	if c.conn == nil {
		return nil, ErrNotConfigured
	}
	resp, err := c.ai.GetPrompt(ctx, &domioaiv1.GetPromptRequest{
		TemplateId: templateID,
		Version:    version,
	})
	if err != nil {
		return nil, fmt.Errorf("adapterclient.GetPrompt: %w", err)
	}
	return &PromptTemplate{
		ID:                 resp.GetId(),
		Version:            resp.GetVersion(),
		ModelClassHint:     resp.GetModelClassHint(),
		InputSchemaJSON:    resp.GetInputSchemaJson(),
		OutputSchemaJSON:   resp.GetOutputSchemaJson(),
		SystemPrompt:       resp.GetSystemPrompt(),
		UserPromptTemplate: resp.GetUserPromptTemplate(),
		EvalSetID:          resp.GetEvalSetId(),
	}, nil
}

// Ensure grpcClient implements Client at compile time.
var _ Client = (*grpcClient)(nil)
