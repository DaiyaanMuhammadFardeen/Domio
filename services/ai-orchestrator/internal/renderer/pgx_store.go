package renderer

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgxExecQuerier is the minimal subset of pgxpool used by pgxDeckStore.
// It is satisfied by *pgxpool.Pool in production. Tests can substitute
// a stub implementation that records SQL + args for assertion without
// requiring a live Postgres.
type pgxExecQuerier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// pgxDeckStore is a Postgres-backed DeckStore. It writes rows to
// `deck_versions`, `slides`, and bumps `decks.current_revision`.
//
// Schema references: migration 0003_deck_schema (decks / deck_versions /
// slides tables). The renderer does NOT create new tables — it
// piggybacks on the schema that the rest of the platform uses for
// append-only deck history.
type pgxDeckStore struct {
	pool *pgxpool.Pool
}

// NewPGXDeckStore returns a DeckStore backed by the given pgx pool.
//
// This closes gap #2 from the Phase 12 status report: the renderer
// was previously write-only-in-memory; production wiring now persists
// deck_versions / slides and bumps decks.current_revision.
func NewPGXDeckStore(pool *pgxpool.Pool) DeckStore {
	return &pgxDeckStore{pool: pool}
}

// GetDeckRevision returns the deck's current revision (0 if no rows).
func (s *pgxDeckStore) GetDeckRevision(ctx context.Context, deckID string) (int64, error) {
	if s.pool == nil {
		return 0, errors.New("pgxDeckStore: pool not initialized")
	}
	const q = `SELECT current_revision FROM decks WHERE id = $1`
	var rev int64
	err := s.pool.QueryRow(ctx, q, deckID).Scan(&rev)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("pgxDeckStore: deck %s not found", deckID)
		}
		return 0, fmt.Errorf("pgxDeckStore: get revision: %w", err)
	}
	return rev, nil
}

// CreateDeckVersion inserts a new deck_versions row.
//
// We use an INSERT (rather than UPSERT) because deck_versions is
// append-only per its PRIMARY KEY (deck_id, revision). Callers must
// have already read the parent revision and bumped the deck's current
// revision to the new value before retrying, otherwise we conflict.
func (s *pgxDeckStore) CreateDeckVersion(ctx context.Context, v *DeckVersion) error {
	if s.pool == nil {
		return errors.New("pgxDeckStore: pool not initialized")
	}
	const q = `
		INSERT INTO deck_versions (
			deck_id, revision, parent_revision, schema_version,
			change_summary, author_id, branch_id, diff_object_key, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			COALESCE($7, 'main'),
			$8, $9
		)`
	// We allow callers to optionally pass a branch_id; the schema
	// eventually adds a `branch` column to deck_versions (0006_phase05)
	// so we read that as `branch_id`. If your migration hasn't yet
	// added it, fall back to NULL via the COALESCE.
	_, err := s.pool.Exec(ctx, q,
		v.DeckID,
		v.Revision,
		v.ParentRevision,
		v.SchemaVersion,
		v.ChangeSummary,
		v.AuthorID,
		v.BranchID,
		v.DiffObjectKey,
		v.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("pgxDeckStore: create deck_version %d for %s: %w",
			v.Revision, v.DeckID, err)
	}
	return nil
}

// UpdateDeckRevision bumps decks.current_revision for the given deck.
func (s *pgxDeckStore) UpdateDeckRevision(ctx context.Context, deckID string, revision int64) error {
	if s.pool == nil {
		return errors.New("pgxDeckStore: pool not initialized")
	}
	const q = `
		UPDATE decks
		   SET current_revision = $2,
		       updated_at       = now()
		 WHERE id = $1`
	tag, err := s.pool.Exec(ctx, q, deckID, revision)
	if err != nil {
		return fmt.Errorf("pgxDeckStore: update revision: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("pgxDeckStore: deck %s not found for revision bump", deckID)
	}
	return nil
}

// CreateSlide inserts a single slides row.
func (s *pgxDeckStore) CreateSlide(ctx context.Context, r *SlideRow) error {
	if s.pool == nil {
		return errors.New("pgxDeckStore: pool not initialized")
	}
	const q = `
		INSERT INTO slides (id, deck_id, position, schema_version, title, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)`
	_, err := s.pool.Exec(ctx, q,
		r.ID, r.DeckID, r.Position, r.SchemaVersion, r.Title, r.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("pgxDeckStore: create slide %s: %w", r.ID, err)
	}
	return nil
}
