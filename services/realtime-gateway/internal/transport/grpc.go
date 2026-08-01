// Package transport provides the gRPC client for communicating with the
// control plane.
//
// NOTE: The control-plane proto defines a ControlPlaneService but the
// gRPC client stubs were not generated (only message types exist in
// command.pb.go). This file defines a minimal gRPC client using raw
// grpc.Invoke calls against the message types.
package transport

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/protobuf/proto"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	cpb "github.com/domio/platform/gen/go/domio/controlplane/v1"
)

// gRPC service method paths matching the proto definition.
const (
	methodGetBranchHead         = "/domio.controlplane.v1.ControlPlaneService/GetBranchHead"
	methodStartRealtimeSession  = "/domio.controlplane.v1.ControlPlaneService/StartRealtimeSession"
	methodEndRealtimeSession    = "/domio.controlplane.v1.ControlPlaneService/EndRealtimeSession"
)

// ControlPlaneClient wraps a gRPC connection to the control-plane service.
type ControlPlaneClient struct {
	conn   *grpc.ClientConn
	logger *zap.Logger
}

// NewControlPlaneClient dials the control plane at the given address.
func NewControlPlaneClient(ctx context.Context, addr string, logger *zap.Logger) (*ControlPlaneClient, error) {
	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler()),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                30 * time.Second,
			Timeout:             10 * time.Second,
			PermitWithoutStream: true,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("control plane dial: %w", err)
	}
	return &ControlPlaneClient{
		conn:   conn,
		logger: logger,
	}, nil
}

// GetBranchHead fetches the current head of a branch from the control plane.
func (c *ControlPlaneClient) GetBranchHead(ctx context.Context, deckID, branchID string) (*rt.BranchHead, error) {
	req := &cpb.GetBranchHeadRequest{
		DeckId:   deckID,
		BranchId: branchID,
	}
	resp := &cpb.GetBranchHeadResponse{}
	if err := c.conn.Invoke(ctx, methodGetBranchHead, req, resp); err != nil {
		return nil, err
	}
	return resp.GetHead(), nil
}

// StartRealtimeSession initiates a realtime session via the control plane.
func (c *ControlPlaneClient) StartRealtimeSession(ctx context.Context, req *cpb.StartRealtimeSessionRequest) (*cpb.StartRealtimeSessionResponse, error) {
	resp := &cpb.StartRealtimeSessionResponse{}
	if err := c.conn.Invoke(ctx, methodStartRealtimeSession, req, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// EndRealtimeSession terminates a session via the control plane.
func (c *ControlPlaneClient) EndRealtimeSession(ctx context.Context, sessionToken, reason string) error {
	req := &cpb.EndRealtimeSessionRequest{
		SessionToken: sessionToken,
		Reason:       reason,
	}
	resp := &cpb.EndRealtimeSessionResponse{}
	return c.conn.Invoke(ctx, methodEndRealtimeSession, req, resp)
}

// Close shuts down the gRPC connection.
func (c *ControlPlaneClient) Close() error {
	return c.conn.Close()
}

// Ensure proto import is used.
var _ proto.Message
