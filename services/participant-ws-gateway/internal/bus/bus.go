// Package bus is a thin in-memory pub/sub for the participant WS
// gateway, mirroring services/realtime-gateway/internal/bus. In
// production this is replaced by a NATS-backed implementation.
package bus

import (
	"sync"
	"sync/atomic"
)

// Message is a single pub/sub payload.
type Message struct {
	Topic string
	Payload []byte
	Seq uint64
	TsMs int64
}

// Handler is invoked for each delivered message.
type Handler func(Message) error

// Bus is a per-process pub/sub.
type Bus struct {
	mu sync.RWMutex
	subscriptions map[string]map[string]*Subscription
	seqs map[string]*atomic.Uint64
}

// Subscription is a single consumer's registration.
type Subscription struct {
	Consumer string
	Topic string
	Handler Handler
	StartSeq uint64
	Done chan struct{}
}

// New creates an empty bus.
func New() *Bus {
	return &Bus{
		subscriptions: map[string]map[string]*Subscription{},
		seqs: map[string]*atomic.Uint64{},
	}
}

// Publish delivers a payload to all subscribers whose start_seq ≤ seq.
func (b *Bus) Publish(topic string, payload []byte) (seq uint64, tsms int64) {
	b.mu.Lock()
	counter := b.seqs[topic]
	if counter == nil {
		counter = &atomic.Uint64{}
		b.seqs[topic] = counter
	}
	seq = counter.Add(1)
	tsms = nowMs()
	subs := snapshotSubs(b.subscriptions[topic])
	b.mu.Unlock()

	msg := Message{Topic: topic, Payload: payload, Seq: seq, TsMs: tsms}
	for _, sub := range subs {
		if seq < sub.StartSeq {
			continue
		}
		select {
		case <-sub.Done:
			continue
		default:
		}
		if sub.Handler != nil {
			_ = sub.Handler(msg)
		}
	}
	return seq, tsms
}

// Subscribe registers a handler for a topic.
func (b *Bus) Subscribe(topic, consumer string, startSeq uint64, handler Handler) *Subscription {
	sub := &Subscription{
		Consumer: consumer,
		Topic: topic,
		Handler: handler,
		StartSeq: startSeq,
		Done: make(chan struct{}),
	}
	b.mu.Lock()
	if b.subscriptions[topic] == nil {
		b.subscriptions[topic] = map[string]*Subscription{}
	}
	b.subscriptions[topic][consumer] = sub
	b.mu.Unlock()
	return sub
}

// Unsubscribe removes a consumer.
func (b *Bus) Unsubscribe(sub *Subscription) {
	b.mu.Lock()
	if bucket := b.subscriptions[sub.Topic]; bucket != nil {
		if existing, ok := bucket[sub.Consumer]; ok && existing == sub {
			delete(bucket, sub.Consumer)
		}
		if len(bucket) == 0 {
			delete(b.subscriptions, sub.Topic)
		}
	}
	b.mu.Unlock()
	select {
	case <-sub.Done:
	default:
		close(sub.Done)
	}
}

// SubCount returns how many consumers are subscribed to a topic.
func (b *Bus) SubCount(topic string) int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscriptions[topic])
}

// Close removes all subscriptions.
func (b *Bus) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, bucket := range b.subscriptions {
		for _, sub := range bucket {
			select {
			case <-sub.Done:
			default:
				close(sub.Done)
			}
		}
	}
	b.subscriptions = map[string]map[string]*Subscription{}
}

func snapshotSubs(bucket map[string]*Subscription) []*Subscription {
	out := make([]*Subscription, 0, len(bucket))
	for _, sub := range bucket {
		out = append(out, sub)
	}
	return out
}

func nowMs() int64 {
	return timeNow().UnixMilli()
}