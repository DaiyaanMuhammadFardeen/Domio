// Package materialize provides a batched, idempotent writer that persists
// CRDT operations into crdt_logs and upserts branch_heads.
//
// The Materializer accepts OpRecords via Push(), buffers them in memory,
// and flushes the buffer to the Store when either the batch size or the
// flush interval timer fires — whichever comes first.  Flushing is done
// in a single goroutine; callers never block on I/O.
//
// The Store interface is intentionally narrow so tests can substitute an
// in-memory implementation.
package materialize

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// OpRecord — a materialised CRDT operation ready for persistence.
// ---------------------------------------------------------------------------

// OpRecord is a denormalised representation of one CRDT operation that the
// materializer will write to crdt_logs.  All fields are plain Go types so
// callers don't need to import protobuf.
type OpRecord struct {
	OpID              string
	DeckID            string
	BranchID          string
	SlideID           string
	AuthorID          string
	HLCPhysical       int64
	HLCLogical        int64
	ParentHLCPhysical *int64 // nil when absent
	ParentHLCLogical  *int64 // nil when absent
	OpType            string // e.g. "yjs_update", "checkpoint", "snapshot"
	Payload           []byte
	Metadata          map[string]any
}

// ---------------------------------------------------------------------------
// Store — persistence abstraction for testability.
// ---------------------------------------------------------------------------

// Store abstracts the database so the materializer can be unit-tested
// against a fake implementation.
type Store interface {
	// InsertOps persists a batch of ops and upserts branch_heads in a
	// single transaction.  Implementations must use ON CONFLICT DO NOTHING
	// for the op_id insert to guarantee idempotency.
	InsertOps(ctx context.Context, ops []OpRecord) error
}

// ---------------------------------------------------------------------------
// Option — functional options for Materializer.
// ---------------------------------------------------------------------------

// Option configures a Materializer.
type Option func(*Materializer)

// WithBatchSize sets the maximum number of ops buffered before an
// automatic flush.  Default: 100.
func WithBatchSize(n int) Option {
	return func(m *Materializer) { m.batchSize = n }
}

// WithFlushInterval sets the maximum time between flushes even when the
// batch isn't full.  Default: 100 ms.
func WithFlushInterval(d time.Duration) Option {
	return func(m *Materializer) { m.flushInterval = d }
}

// WithFlushCallback sets a function called after every successful flush
// with the ops that were written.  Useful for driving the snapshot counter.
func WithFlushCallback(fn func([]OpRecord)) Option {
	return func(m *Materializer) { m.onFlush = fn }
}

// ---------------------------------------------------------------------------
// Materializer — batched async writer.
// ---------------------------------------------------------------------------

// Materializer buffers OpRecords and flushes them to the Store in batches.
type Materializer struct {
	store         Store
	logger        *zap.Logger
	onFlush       func([]OpRecord)
	batchSize     int
	flushInterval time.Duration

	mu     sync.Mutex
	buffer []OpRecord
	timer  *time.Timer

	flushCh chan struct{} // signal the run-loop to flush now
	stopCh  chan struct{} // signal the run-loop to exit
	doneCh  chan struct{} // closed when the run-loop exits

	// Counters exposed for observability.
	OpsFlushed   uint64
	FlushCount   uint64
	FlushErrors  uint64
}

// New creates a Materializer and starts its background flush goroutine.
func New(store Store, logger *zap.Logger, opts ...Option) *Materializer {
	m := &Materializer{
		store:         store,
		logger:        logger,
		batchSize:     100,
		flushInterval: 100 * time.Millisecond,
		flushCh:       make(chan struct{}, 1),
		stopCh:        make(chan struct{}),
		doneCh:        make(chan struct{}),
	}
	for _, opt := range opts {
		opt(m)
	}
	m.timer = time.NewTimer(m.flushInterval)
	m.timer.Stop()
	go m.run()
	return m
}

// Push enqueues an op for batched persistence.  It never blocks.
func (m *Materializer) Push(op OpRecord) {
	m.mu.Lock()
	wasEmpty := len(m.buffer) == 0
	m.buffer = append(m.buffer, op)
	needFlush := len(m.buffer) >= m.batchSize
	if needFlush && !m.timer.Stop() {
		select {
		case <-m.timer.C:
		default:
		}
	}
	// Start the flush timer on the first buffered op so the timer-based
	// flush fires even when the batch never reaches batchSize.
	if wasEmpty && !needFlush {
		m.timer.Reset(m.flushInterval)
	}
	m.mu.Unlock()

	if needFlush {
		select {
		case m.flushCh <- struct{}{}:
		default:
		}
	}
}

// Stop drains remaining ops and shuts down the flush goroutine.
// It blocks until the goroutine exits.
func (m *Materializer) Stop() {
	close(m.stopCh)
	<-m.doneCh
}

// BufferLen returns the current number of buffered (unflushed) ops.
func (m *Materializer) BufferLen() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.buffer)
}

// ---------------------------------------------------------------------------
// internal run-loop
// ---------------------------------------------------------------------------

func (m *Materializer) run() {
	defer close(m.doneCh)
	for {
		select {
		case <-m.stopCh:
			// Drain remaining buffer on shutdown.
			m.drain()
			return
		case <-m.flushCh:
			m.flush()
		case <-m.timer.C:
			m.flush()
		}
	}
}

func (m *Materializer) flush() {
	m.mu.Lock()
	if len(m.buffer) == 0 {
		m.mu.Unlock()
		return
	}
	batch := m.buffer
	m.buffer = make([]OpRecord, 0, m.batchSize)
	m.mu.Unlock()

	if err := m.store.InsertOps(context.Background(), batch); err != nil {
		m.logger.Error("flush failed",
			zap.Int("ops", len(batch)),
			zap.Error(err),
		)
		m.mu.Lock()
		m.FlushErrors++
		m.mu.Unlock()
		return
	}

	m.mu.Lock()
	m.OpsFlushed += uint64(len(batch))
	m.FlushCount++
	m.mu.Unlock()

	m.logger.Debug("flushed ops", zap.Int("count", len(batch)))

	if m.onFlush != nil {
		m.onFlush(batch)
	}

	// Restart the flush timer.
	m.timer.Reset(m.flushInterval)
}

func (m *Materializer) drain() {
	m.mu.Lock()
	batch := m.buffer
	m.buffer = nil
	m.mu.Unlock()

	if len(batch) == 0 {
		return
	}
	m.logger.Info("draining remaining ops", zap.Int("count", len(batch)))
	if err := m.store.InsertOps(context.Background(), batch); err != nil {
		m.logger.Error("drain flush failed", zap.Int("ops", len(batch)), zap.Error(err))
		return
	}
	m.mu.Lock()
	m.OpsFlushed += uint64(len(batch))
	m.FlushCount++
	m.mu.Unlock()
	if m.onFlush != nil {
		m.onFlush(batch)
	}
}

// ---------------------------------------------------------------------------
// pgxStore — Postgres-backed Store implementation.
// ---------------------------------------------------------------------------

// NewPGXStore returns a Store backed by the given connection pool.
func NewPGXStore(pool *pgxpool.Pool) Store {
	return &pgxStore{pool: pool}
}

type pgxStore struct {
	pool *pgxpool.Pool
}

// InsertOps writes a batch of ops into crdt_logs (ON CONFLICT DO NOTHING)
// and upserts branch_heads — all in one transaction.
func (s *pgxStore) InsertOps(ctx context.Context, ops []OpRecord) error {
	if len(ops) == 0 {
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// ── Batch insert into crdt_logs ──────────────────────────────────
	batch := &pgx.Batch{}
	for _, op := range ops {
		metaJSON, err := json.Marshal(op.Metadata)
		if err != nil {
			metaJSON = []byte("{}")
		}
		batch.Queue(
			`INSERT INTO crdt_logs
				(op_id, deck_id, branch_id, slide_id, author_id,
				 hlc_physical, hlc_logical, parent_hlc_physical, parent_hlc_logical,
				 op_type, payload, metadata)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			 ON CONFLICT (op_id) DO NOTHING`,
			op.OpID, op.DeckID, op.BranchID, op.SlideID, op.AuthorID,
			op.HLCPhysical, op.HLCLogical, op.ParentHLCPhysical, op.ParentHLCLogical,
			op.OpType, op.Payload, metaJSON,
		)
	}

	br := tx.SendBatch(ctx, batch)
	for i := 0; i < len(ops); i++ {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return fmt.Errorf("insert op %d: %w", i, err)
		}
	}
	if err := br.Close(); err != nil {
		return fmt.Errorf("close batch: %w", err)
	}

	// ── Upsert branch_heads ──────────────────────────────────────────
	// For each unique (deck_id, branch_id), compute the maximum HLC in
	// the batch and upsert it.  The GREATEST / CASE expressions ensure
	// the stored head is always advanced forward.
	type branchKey struct {
		deckID, branchID string
	}
	type hlcPair struct {
		physical, logical int64
	}
	maxHLC := make(map[branchKey]hlcPair)
	for _, op := range ops {
		k := branchKey{op.DeckID, op.BranchID}
		cur, ok := maxHLC[k]
		if !ok || op.HLCPhysical > cur.physical ||
			(op.HLCPhysical == cur.physical && op.HLCLogical > cur.logical) {
			maxHLC[k] = hlcPair{op.HLCPhysical, op.HLCLogical}
		}
	}

	for k, h := range maxHLC {
		_, err := tx.Exec(ctx,
			`INSERT INTO branch_heads (deck_id, branch_id, hlc_physical, hlc_logical)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (deck_id, branch_id) DO UPDATE SET
			   hlc_physical = GREATEST(branch_heads.hlc_physical, EXCLUDED.hlc_physical),
			   hlc_logical  = CASE
			     WHEN EXCLUDED.hlc_physical > branch_heads.hlc_physical THEN EXCLUDED.hlc_logical
			     WHEN EXCLUDED.hlc_physical = branch_heads.hlc_physical
			          AND EXCLUDED.hlc_logical  > branch_heads.hlc_logical THEN EXCLUDED.hlc_logical
			     ELSE branch_heads.hlc_logical
			   END,
			   updated_at = now()`,
			k.deckID, k.branchID, h.physical, h.logical,
		)
		if err != nil {
			return fmt.Errorf("upsert branch_head (%s,%s): %w", k.deckID, k.branchID, err)
		}
	}

	return tx.Commit(ctx)
}

// ---------------------------------------------------------------------------
// MemStore — in-memory Store for unit tests.
// ---------------------------------------------------------------------------

// MemStore is a thread-safe in-memory Store for testing.
type MemStore struct {
	mu   sync.Mutex
	Ops  []OpRecord
	Heads map[string]map[string][2]int64 // deck_id -> branch_id -> [physical, logical]
}

// NewMemStore returns a ready-to-use MemStore.
func NewMemStore() *MemStore {
	return &MemStore{
		Heads: make(map[string]map[string][2]int64),
	}
}

// InsertOps appends ops to the in-memory log and updates heads.
func (m *MemStore) InsertOps(_ context.Context, ops []OpRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, op := range ops {
		m.Ops = append(m.Ops, op)
		if m.Heads[op.DeckID] == nil {
			m.Heads[op.DeckID] = make(map[string][2]int64)
		}
		cur := m.Heads[op.DeckID][op.BranchID]
		if op.HLCPhysical > cur[0] || (op.HLCPhysical == cur[0] && op.HLCLogical > cur[1]) {
			m.Heads[op.DeckID][op.BranchID] = [2]int64{op.HLCPhysical, op.HLCLogical}
		}
	}
	return nil
}

// OpCount returns the number of stored ops.
func (m *MemStore) OpCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Ops)
}
