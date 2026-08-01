// Package snapshot manages periodic CRDT state snapshots for bounded replay.
//
// Every SNAPSHOT_EVERY ops per deck the snapshot manager writes a snapshot
// marker row into crdt_logs (op_type = "snapshot") whose payload is a
// gzip-compressed concatenation of all Yjs update payloads since the last
// snapshot.  New subscribers can load the latest snapshot and only replay
// the (smaller) tail of operations after it.
//
// Snapshot creation is driven by the Materializer's flush callback — no
// separate goroutine or ticker is needed.  The actual DB writes happen
// synchronously inside the callback so snapshot rows are always consistent
// with the op log.
package snapshot

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// OpInfo is the minimal subset of an op record needed by the snapshot
// manager.  It avoids a circular import with the materialize package.
// ---------------------------------------------------------------------------

// OpInfo carries the fields the snapshot manager cares about.
type OpInfo struct {
	OpID   string
	DeckID string
	OpType string
}

// ---------------------------------------------------------------------------
// Store — persistence for snapshot operations.
// ---------------------------------------------------------------------------

// SnapshotStore abstracts the database operations needed by the snapshot
// manager.  The production implementation wraps pgx; tests can use fakes.
type SnapshotStore interface {
	// InsertSnapshotRow writes a snapshot marker row into crdt_logs.
	InsertSnapshotRow(ctx context.Context, row SnapshotRow) error

	// LastSnapshotHLC returns the HLC of the most recent snapshot for
	// the given deck, or (0, 0) if no snapshot exists.
	LastSnapshotHLC(ctx context.Context, deckID string) (physical, logical int64, err error)

	// PayloadsSince returns the ordered payload bytes for all non-snapshot
	// ops on the given branch whose HLC is strictly after (afterPhysical,
	// afterLogical).
	PayloadsSince(ctx context.Context, deckID, branchID string, afterPhysical, afterLogical int64) ([][]byte, error)

	// ListBranches returns the distinct branch_ids that have non-snapshot
	// ops for the given deck.
	ListBranches(ctx context.Context, deckID string) ([]string, error)

	// BranchMaxHLC returns the max HLC among non-snapshot ops on the
	// branch that are after the given HLC.
	BranchMaxHLC(ctx context.Context, deckID, branchID string, afterPhysical, afterLogical int64) (int64, int64, error)
}

// SnapshotRow is a snapshot marker row to insert into crdt_logs.
type SnapshotRow struct {
	OpID        string
	DeckID      string
	BranchID    string
	HLCPhysical int64
	HLCLogical  int64
	Payload     []byte // gzip-compressed state chunk
}

// ---------------------------------------------------------------------------
// PGX-backed SnapshotStore.
// ---------------------------------------------------------------------------

// NewPGXSnapshotStore returns a SnapshotStore backed by the given pool.
func NewPGXSnapshotStore(pool *pgxpool.Pool) SnapshotStore {
	return &pgxSnapshotStore{pool: pool}
}

type pgxSnapshotStore struct {
	pool *pgxpool.Pool
}

func (s *pgxSnapshotStore) InsertSnapshotRow(ctx context.Context, row SnapshotRow) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO crdt_logs
			(op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical,
			 op_type, payload, metadata)
		 VALUES ($1, $2, $3, 'system', $4, $5, 'snapshot', $6, '{}'::jsonb)
		 ON CONFLICT (op_id) DO NOTHING`,
		row.OpID, row.DeckID, row.BranchID,
		row.HLCPhysical, row.HLCLogical, row.Payload,
	)
	return err
}

func (s *pgxSnapshotStore) LastSnapshotHLC(ctx context.Context, deckID string) (int64, int64, error) {
	var phys, logi int64
	err := s.pool.QueryRow(ctx,
		`SELECT hlc_physical, hlc_logical
		 FROM crdt_logs
		 WHERE deck_id = $1 AND op_type = 'snapshot'
		 ORDER BY hlc_physical DESC, hlc_logical DESC
		 LIMIT 1`,
		deckID,
	).Scan(&phys, &logi)
	if err != nil {
		// No snapshot yet — return (0, 0) without error.
		return 0, 0, nil
	}
	return phys, logi, nil
}

func (s *pgxSnapshotStore) PayloadsSince(ctx context.Context, deckID, branchID string, afterPhysical, afterLogical int64) ([][]byte, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT payload FROM crdt_logs
		 WHERE deck_id = $1 AND branch_id = $2
		   AND op_type != 'snapshot'
		   AND (hlc_physical > $3 OR (hlc_physical = $3 AND hlc_logical > $4))
		 ORDER BY hlc_physical ASC, hlc_logical ASC`,
		deckID, branchID, afterPhysical, afterLogical,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payloads [][]byte
	for rows.Next() {
		var p []byte
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		payloads = append(payloads, p)
	}
	return payloads, rows.Err()
}

func (s *pgxSnapshotStore) ListBranches(ctx context.Context, deckID string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT branch_id FROM crdt_logs
		 WHERE deck_id = $1 AND op_type != 'snapshot'`,
		deckID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var branches []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}
	if len(branches) == 0 {
		branches = []string{"main"}
	}
	return branches, rows.Err()
}

func (s *pgxSnapshotStore) BranchMaxHLC(ctx context.Context, deckID, branchID string, afterPhysical, afterLogical int64) (int64, int64, error) {
	var phys, logi int64
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(hlc_physical), 0), COALESCE(MAX(hlc_logical), 0)
		 FROM crdt_logs
		 WHERE deck_id = $1 AND branch_id = $2 AND op_type != 'snapshot'
		   AND (hlc_physical > $3 OR (hlc_physical = $3 AND hlc_logical > $4))`,
		deckID, branchID, afterPhysical, afterLogical,
	).Scan(&phys, &logi)
	return phys, logi, err
}

// ---------------------------------------------------------------------------
// Manager — the snapshot orchestrator.
// ---------------------------------------------------------------------------

// Manager counts ops per deck and triggers snapshot creation every
// snapshotEvery ops.  It is safe to call OnOpsFlushed from any goroutine.
type Manager struct {
	store         SnapshotStore
	logger        *zap.Logger
	snapshotEvery int64
	generateOpID  func() string // injected for testability

	mu     sync.Mutex
	counts map[string]int64 // deck_id → ops flushed since last snapshot
}

// ManagerOption configures a Manager.
type ManagerOption func(*Manager)

// WithOpIDGenerator overrides the default ULID op_id generator.
func WithOpIDGenerator(fn func() string) ManagerOption {
	return func(m *Manager) { m.generateOpID = fn }
}

// NewManager returns a snapshot Manager.
func NewManager(store SnapshotStore, logger *zap.Logger, snapshotEvery int64, opts ...ManagerOption) *Manager {
	m := &Manager{
		store:         store,
		logger:        logger,
		snapshotEvery: snapshotEvery,
		generateOpID:  defaultOpID,
		counts:        make(map[string]int64),
	}
	for _, opt := range opts {
		opt(m)
	}
	return m
}

// OnOpsFlushed must be called after each successful materializer flush
// with the ops that were written.  It counts ops per deck and triggers
// snapshot creation when the threshold is reached.
func (m *Manager) OnOpsFlushed(ops []OpInfo) {
	// Tally per-deck counts from the flushed batch.
	tally := make(map[string]int64)
	for _, op := range ops {
		if op.OpType == "snapshot" {
			continue // don't count snapshot rows themselves
		}
		tally[op.DeckID]++
	}

	m.mu.Lock()
	for deckID, n := range tally {
		m.counts[deckID] += n
		if m.counts[deckID] >= m.snapshotEvery {
			m.counts[deckID] = 0
			go m.CreateSnapshot(deckID)
		}
	}
	m.mu.Unlock()
}

// CreateSnapshot forces a snapshot for the given deck.  Exported so the
// prune job or CLI can trigger it on demand.
func (m *Manager) CreateSnapshot(deckID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Find the latest snapshot HLC (or 0,0 if none).
	lastPhys, lastLogi, err := m.store.LastSnapshotHLC(ctx, deckID)
	if err != nil {
		m.logger.Error("snapshot: failed to read last HLC",
			zap.String("deck_id", deckID), zap.Error(err))
		return
	}

	// List branches that have ops.
	branches, err := m.store.ListBranches(ctx, deckID)
	if err != nil {
		m.logger.Error("snapshot: failed to list branches",
			zap.String("deck_id", deckID), zap.Error(err))
		return
	}

	// Compute the max HLC across all branches for the snapshot row.
	var maxPhys, maxLogi int64
	for _, br := range branches {
		phys, logi, err := m.store.BranchMaxHLC(ctx, deckID, br, lastPhys, lastLogi)
		if err != nil {
			m.logger.Error("snapshot: failed to read branch max HLC",
				zap.String("deck_id", deckID), zap.String("branch_id", br), zap.Error(err))
			continue
		}
		if phys > maxPhys || (phys == maxPhys && logi > maxLogi) {
			maxPhys = phys
			maxLogi = logi
		}
	}

	// Gather payloads across all branches since the last snapshot.
	var allPayloads [][]byte
	for _, br := range branches {
		payloads, err := m.store.PayloadsSince(ctx, deckID, br, lastPhys, lastLogi)
		if err != nil {
			m.logger.Error("snapshot: failed to read payloads",
				zap.String("deck_id", deckID), zap.String("branch_id", br), zap.Error(err))
			continue
		}
		allPayloads = append(allPayloads, payloads...)
	}

	if len(allPayloads) == 0 {
		m.logger.Debug("snapshot: no ops to snapshot",
			zap.String("deck_id", deckID))
		return
	}

	// Compress the concatenated payloads.
	compressed, err := compressPayloads(allPayloads)
	if err != nil {
		m.logger.Error("snapshot: compression failed",
			zap.String("deck_id", deckID), zap.Error(err))
		return
	}

	row := SnapshotRow{
		OpID:        m.generateOpID(),
		DeckID:      deckID,
		BranchID:    "main",
		HLCPhysical: maxPhys,
		HLCLogical:  maxLogi,
		Payload:     compressed,
	}

	if err := m.store.InsertSnapshotRow(ctx, row); err != nil {
		m.logger.Error("snapshot: insert failed",
			zap.String("deck_id", deckID), zap.Error(err))
		return
	}

	m.logger.Info("snapshot created",
		zap.String("deck_id", deckID),
		zap.Int("ops_included", len(allPayloads)),
		zap.Int("compressed_bytes", len(compressed)),
		zap.Int64("hlc_physical", maxPhys),
	)
}

// compressPayloads concatenates payloads and gzip-compresses the result.
// Each payload is length-prefixed (4 bytes big-endian) so boundaries can
// be reconstructed on decompression.
func compressPayloads(payloads [][]byte) ([]byte, error) {
	var buf bytes.Buffer
	gz, err := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err != nil {
		return nil, err
	}
	for _, p := range payloads {
		size := uint32(len(p))
		gz.Write([]byte{byte(size >> 24), byte(size >> 16), byte(size >> 8), byte(size)})
		gz.Write(p)
	}
	if err := gz.Close(); err != nil {
		return nil, fmt.Errorf("gzip close: %w", err)
	}
	return buf.Bytes(), nil
}

// defaultOpID is a placeholder op_id generator.  In production this is
// replaced by a ULID generator.
func defaultOpID() string {
	return fmt.Sprintf("snap_%d", time.Now().UnixNano())
}
