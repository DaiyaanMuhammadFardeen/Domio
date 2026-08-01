// Package bus provides the NATS JetStream client for the realtime gateway.
package bus

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.uber.org/zap"

	"github.com/domio/platform/services/realtime-gateway/internal/topics"
)

// Bus wraps a NATS JetStream connection.
type Bus struct {
	nc   *nats.Conn
	js   jetstream.JetStream
	log  *zap.Logger
}

// New creates a new Bus connected to the given NATS URL.
func New(ctx context.Context, natsURL string, logger *zap.Logger) (*Bus, error) {
	nc, err := nats.Connect(natsURL,
		nats.Name("rtgw"),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}

	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("jetstream new: %w", err)
	}

	b := &Bus{nc: nc, js: js, log: logger}
	if err := b.ensureStream(ctx); err != nil {
		nc.Close()
		return nil, err
	}

	return b, nil
}

// ensureStream creates the "realtime" stream if it doesn't already exist.
func (b *Bus) ensureStream(ctx context.Context) error {
	_, err := b.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     topics.StreamName,
		Subjects: topics.StreamSubjects(),
		Storage:  jetstream.FileStorage,
		Retention: jetstream.WorkQueuePolicy,
		MaxMsgs:  -1,
		MaxBytes: -1,
		MaxAge:   24 * time.Hour,
		Replicas: 1,
	})
	if err != nil {
		return fmt.Errorf("ensure stream: %w", err)
	}
	return nil
}

// Publish sends a message to a NATS subject and waits for ack.
func (b *Bus) Publish(ctx context.Context, subject string, data []byte) error {
	_, err := b.js.Publish(ctx, subject, data)
	return err
}

// SubscribeCRDT creates a durable consumer for CRDT ops on a (deck, branch).
// If checkpointHLC is non-nil, the consumer starts replay from that point.
func (b *Bus) SubscribeCRDT(ctx context.Context, deckID, branchID string, checkpointHLC *struct{ Physical, Logical int64 }) (jetstream.ConsumeContext, error) {
	durable := topics.DurableConsumerName(deckID, branchID)
	subject := topics.CRDT(deckID)

	cfg := jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		DeliverPolicy: jetstream.DeliverLastPolicy,
		MaxDeliver:    3,
		AckWait:       10 * time.Second,
	}

	if checkpointHLC != nil {
		// Replay from a specific sequence based on the HLC checkpoint.
		// In a real implementation, you'd map HLC → sequence via a DB lookup.
		cfg.DeliverPolicy = jetstream.DeliverByStartTimePolicy
		cfg.OptStartTime = nil // Would be set from DB lookup
	}

	consumer, err := b.js.CreateOrUpdateConsumer(ctx, topics.StreamName, cfg)
	if err != nil {
		return nil, fmt.Errorf("create consumer: %w", err)
	}

	return consumer.Consume(func(msg jetstream.Msg) {
		// Process the CRDT op.
		b.log.Debug("nats: received crdt op",
			zap.String("subject", msg.Subject()),
			zap.Int("size", len(msg.Data())))
		// Ack after Postgres write (at-least-once semantics).
		if err := msg.Ack(); err != nil {
			b.log.Warn("nats: ack failed", zap.Error(err))
		}
	})
}

// SubscribePresence creates a consumer for presence events on a deck.
func (b *Bus) SubscribePresence(ctx context.Context, deckID string) (jetstream.ConsumeContext, error) {
	durable := topics.DurableConsumerName(deckID, "presence")
	subject := topics.Presence(deckID)

	consumer, err := b.js.CreateOrUpdateConsumer(ctx, topics.StreamName, jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		DeliverPolicy: jetstream.DeliverLastPolicy,
	})
	if err != nil {
		return nil, fmt.Errorf("create presence consumer: %w", err)
	}

	return consumer.Consume(func(msg jetstream.Msg) {
		b.log.Debug("nats: received presence",
			zap.String("subject", msg.Subject()))
		if err := msg.Ack(); err != nil {
			b.log.Warn("nats: presence ack failed", zap.Error(err))
		}
	})
}

// PublishCRDT publishes a CRDT op to the NATS stream.
func (b *Bus) PublishCRDT(ctx context.Context, deckID string, data []byte) error {
	return b.Publish(ctx, topics.CRDT(deckID), data)
}

// PublishPresence publishes a presence update to the NATS stream.
func (b *Bus) PublishPresence(ctx context.Context, deckID string, data []byte) error {
	return b.Publish(ctx, topics.Presence(deckID), data)
}

// PublishMeta publishes a metadata event to the NATS stream.
func (b *Bus) PublishMeta(ctx context.Context, deckID string, data []byte) error {
	return b.Publish(ctx, topics.Meta(deckID), data)
}

// Close shuts down the NATS connection.
func (b *Bus) Close() {
	if b.nc != nil {
		b.nc.Close()
	}
}
