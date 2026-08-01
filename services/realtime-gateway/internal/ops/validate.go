// Package ops provides CRDT operation validation for the realtime gateway.
package ops

import (
	"context"
	"errors"
	"fmt"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// MaxPayloadSize is the maximum allowed Yjs payload size (1 MiB).
	MaxPayloadSize = 1 << 20

	// maxULIDLen is the expected length of a Crockford Base32 ULID.
	maxULIDLen = 26
)

var (
	ErrMalformedOpID  = errors.New("ops: malformed op_id (expected 26-char ULID)")
	ErrEmptyAuthorID  = errors.New("ops: author_id is required")
	ErrMissingHLC     = errors.New("ops: hlc is required")
	ErrHLCCausal      = errors.New("ops: hlc must be causally after parent_hlc")
	ErrPayloadTooLarge = errors.New("ops: payload exceeds 1 MiB limit")
	ErrDeckMismatch   = errors.New("ops: deck_id does not match session deck")
	ErrDuplicateOp    = errors.New("ops: duplicate op (already applied)")
	ErrReorderedOp    = errors.New("ops: reordered duplicate (op with lower hlc already applied)")
)

// ULID-valid characters: Crockford Base32 without I, L, O, U.
const validULIDChars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

func isULIDChar(b byte) bool {
	for i := 0; i < len(validULIDChars); i++ {
		if validULIDChars[i] == b {
			return true
		}
	}
	return false
}

// ValidateOpID checks that the op_id is a valid 26-character ULID.
func ValidateOpID(opID string) error {
	if len(opID) != maxULIDLen {
		return ErrMalformedOpID
	}
	for i := 0; i < maxULIDLen; i++ {
		if !isULIDChar(opID[i]) {
			return ErrMalformedOpID
		}
	}
	return nil
}

// Validate performs all static validation checks on an Op (without DB access).
func Validate(op *rt.Op, sessionDeckID string) error {
	// op_id must be valid ULID
	if err := ValidateOpID(op.GetOpId()); err != nil {
		return err
	}

	// author_id non-empty
	if op.GetAuthorId() == "" {
		return ErrEmptyAuthorID
	}

	// hlc must be present
	if op.GetHlc() == nil {
		return ErrMissingHLC
	}

	// parent_hlc causal check: op.hlc > parent_hlc
	if op.GetParentHlc() != nil {
		if op.GetHlc().GetPhysical() < op.GetParentHlc().GetPhysical() ||
			(op.GetHlc().GetPhysical() == op.GetParentHlc().GetPhysical() &&
				op.GetHlc().GetLogical() <= op.GetParentHlc().GetLogical()) {
			return ErrHLCCausal
		}
	}

	// payload size ≤ 1 MiB
	if len(op.GetPayload()) > MaxPayloadSize {
		return ErrPayloadTooLarge
	}

	// deck_id must match session deck
	if op.GetDeckId() != sessionDeckID {
		return ErrDeckMismatch
	}

	return nil
}

// ValidateAndCheckDuplicate performs static validation AND checks for
// idempotent insert in Postgres. Returns (applied bool, ack *OpAck, err).
//
// The crdt_logs table must have a PK on op_id; the INSERT uses
// ON CONFLICT DO NOTHING. If rows affected is 0 the op is a duplicate.
func ValidateAndCheckDuplicate(ctx context.Context, db *pgxpool.Pool, op *rt.Op, sessionDeckID string) (bool, *rt.OpAck, error) {
	// Static validation.
	if err := Validate(op, sessionDeckID); err != nil {
		return false, &rt.OpAck{
			OpId:     op.GetOpId(),
			Applied:  false,
			Reason:   err.Error(),
			ServerHlc: op.GetHlc(),
		}, err
	}

	if db == nil {
		// No DB configured (tests) — accept unconditionally.
		return true, nil, nil
	}

	// Attempt idempotent insert.
	tag, err := db.Exec(ctx, `
		INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, payload, op_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (op_id) DO NOTHING
	`, op.GetOpId(), op.GetDeckId(), op.GetBranchId(), op.GetAuthorId(),
		op.GetHlc().GetPhysical(), op.GetHlc().GetLogical(), op.GetPayload(), int32(op.GetOpType()))
	if err != nil {
		return false, nil, fmt.Errorf("ops: insert crdt_logs: %w", err)
	}

	if tag.RowsAffected() == 0 {
		// Duplicate — op was already applied.
		return false, &rt.OpAck{
			OpId:     op.GetOpId(),
			Applied:  false,
			Reason:   "duplicate op_id",
			ServerHlc: op.GetHlc(),
		}, ErrDuplicateOp
	}

	return true, nil, nil
}
