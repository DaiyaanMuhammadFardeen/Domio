// Package dlq publishes CRM sync failures to the NATS JetStream
// dead-letter queue (subject `crm.dlq`) and to the ClickHouse
// `crm_sync_record` table. It is the safety net for retry exhaustion
// so a poison event does not block the worker forever.
//
// The DLQ payload is a small JSON envelope:
//
//   {
//     "workspace_id": "...",
//     "connection_id": "...",
//     "viewer_id_key": "...",
//     "event_id": "...",
//     "event_name": "...",
//     "idempotency_key": "...",
//     "attempts": 5,
//     "last_error": "...",
//     "failed_at_ms": 1700000000000
//   }
//
// The crm-sync worker subscribes to `crm.dlq` to drive alerting
// (PagerDuty) and manual remediation.
package dlq

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"go.uber.org/zap"
)

// Subject is the canonical NATS subject for dead-letter records.
const Subject = "crm.dlq"

// Message is the JSON envelope the crm-sync worker publishes.
type Message struct {
	WorkspaceID    string `json:"workspace_id"`
	ConnectionID   string `json:"connection_id"`
	ViewerIDKey    string `json:"viewer_id_key"`
	EventID        string `json:"event_id"`
	EventName      string `json:"event_name"`
	IdempotencyKey string `json:"idempotency_key"`
	Attempts       int    `json:"attempts"`
	LastError      string `json:"last_error"`
	FailedAtMs     int64  `json:"failed_at_ms"`
}

// Publisher is the interface crm-sync uses to push failed records.
type Publisher interface {
	Publish(ctx context.Context, msg Message) error
	Close() error
}

// NatsPublisher publishes via JetStream.
type NatsPublisher struct {
	js     jetstream.JetStream
	nc     *nats.Conn
	logger *zap.Logger
}

// NewNatsPublisher dials NATS and creates (or reuses) the JetStream
// stream that owns the DLQ subject.
func NewNatsPublisher(ctx context.Context, natsURL string, logger *zap.Logger) (*NatsPublisher, error) {
	if logger == nil {
		logger = zap.NewNop()
	}
	nc, err := nats.Connect(natsURL,
		nats.Name("crm-sync-dlq"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("dlq: nats connect: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("dlq: jetstream: %w", err)
	}
	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     "CRM_DLQ",
		Subjects: []string{Subject},
		Storage:  jetstream.FileStorage,
		Retention: jetstream.WorkQueuePolicy,
		MaxAge:   7 * 24 * time.Hour,
	}); err != nil {
		nc.Close()
		return nil, fmt.Errorf("dlq: create stream: %w", err)
	}
	return &NatsPublisher{js: js, nc: nc, logger: logger}, nil
}

// Publish encodes msg as JSON and writes it to the DLQ subject.
func (p *NatsPublisher) Publish(ctx context.Context, msg Message) error {
	buf, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("dlq: marshal: %w", err)
	}
	if _, err := p.js.Publish(ctx, Subject, buf); err != nil {
		p.logger.Warn("dlq: publish failed",
			zap.String("subject", Subject),
			zap.Error(err))
		return err
	}
	p.logger.Info("dlq: published",
		zap.String("subject", Subject),
		zap.String("connection_id", msg.ConnectionID),
		zap.String("event_id", msg.EventID),
		zap.Int("attempts", msg.Attempts))
	return nil
}

// Close drains the NATS connection.
func (p *NatsPublisher) Close() error {
	if p.nc == nil {
		return nil
	}
	p.nc.Close()
	return nil
}

// InMemoryPublisher is a no-network Publisher used by tests and by
// the orchestrator before NATS is configured.
type InMemoryPublisher struct {
	Messages []Message
}

// Publish appends the message to the in-memory buffer.
func (p *InMemoryPublisher) Publish(_ context.Context, msg Message) error {
	p.Messages = append(p.Messages, msg)
	return nil
}

// Close is a no-op.
func (p *InMemoryPublisher) Close() error { return nil }
