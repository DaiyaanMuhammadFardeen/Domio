// Package kafkacons wraps the segmentio/kafka-go reader and writer
// used by the clickhouse-loader.
package kafkacons

import (
	"context"
	"errors"
	"time"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"

	"github.com/domio/platform/services/clickhouse-loader/internal/metrics"
)

// Config holds the consumer parameters.
type Config struct {
	Brokers     string
	Topic       string
	GroupID     string
	DLQTopic    string
	Logger      *zap.Logger
	Metrics     *metrics.Metrics
	Concurrency int
}

// Consumer owns a kafka.Reader and a kafka.Writer used to send bad
// records to the DLQ topic.
type Consumer struct {
	reader  *kafka.Reader
	dlq     *kafka.Writer
	cfg     Config
}

// New constructs the reader and DLQ writer.
func New(cfg Config) (*Consumer, error) {
	if cfg.Brokers == "" {
		return nil, errors.New("kafka brokers required")
	}
	if cfg.Topic == "" {
		return nil, errors.New("kafka topic required")
	}
	if cfg.GroupID == "" {
		return nil, errors.New("kafka group id required")
	}
	concurrency := cfg.Concurrency
	if concurrency < 1 {
		concurrency = 1
	}
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        []string{cfg.Brokers},
		GroupID:        cfg.GroupID,
		Topic:          cfg.Topic,
		MinBytes:       1,
		MaxBytes:       10 * 1024 * 1024,
		MaxWait:        500 * time.Millisecond,
		CommitInterval: 0, // commit manually after successful insert
		StartOffset:    kafka.FirstOffset,
	})
	dlq := &kafka.Writer{
		Addr:                   kafka.TCP(cfg.Brokers),
		Topic:                  cfg.DLQTopic,
		Balancer:               &kafka.Hash{},
		RequiredAcks:           kafka.RequireAll,
		AllowAutoTopicCreation: false,
		BatchTimeout:           50 * time.Millisecond,
	}
	cfg.Logger.Info("kafka consumer ready",
		zap.String("topic", cfg.Topic),
		zap.String("group", cfg.GroupID),
		zap.Int("concurrency", concurrency))
	return &Consumer{reader: reader, dlq: dlq, cfg: cfg}, nil
}

// Next returns the next Kafka message. ok is false when the read
// timed out without producing a message.
func (c *Consumer) Next(ctx context.Context) (msg kafka.Message, ok bool, err error) {
	m, err := c.reader.FetchMessage(ctx)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return kafka.Message{}, false, err
		}
		return kafka.Message{}, false, err
	}
	return m, true, nil
}

// Commit marks a set of messages as processed in the consumer group.
func (c *Consumer) Commit(ctx context.Context, msgs []kafka.Message) error {
	if len(msgs) == 0 {
		return nil
	}
	return c.reader.CommitMessages(ctx, msgs...)
}

// SendToDLQ publishes a single bad message to the DLQ topic with a
// header recording the reason.
func (c *Consumer) SendToDLQ(ctx context.Context, msg kafka.Message, reason string) error {
	headers := append([]kafka.Header{}, msg.Headers...)
	headers = append(headers, kafka.Header{Key: "x-dlq-reason", Value: []byte(reason)})
	return c.dlq.WriteMessages(ctx, kafka.Message{
		Key:     msg.Key,
		Value:   msg.Value,
		Headers: headers,
	})
}

// Close releases reader and writer resources.
func (c *Consumer) Close() error {
	var errs []error
	if c.reader != nil {
		if err := c.reader.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if c.dlq != nil {
		if err := c.dlq.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}