package ops

import (
	"testing"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateOpID(t *testing.T) {
	tests := []struct {
		name    string
		opID    string
		wantErr bool
	}{
		{
			name:    "valid ULID (26 chars)",
			opID:    "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			wantErr: false,
		},
		{
			name:    "invalid - too short",
			opID:    "01ARZ3NDEKTSV4RR",
			wantErr: true,
		},
		{
			name:    "invalid - too long",
			opID:    "01ARZ3NDEKTSV4RRFFQ69G5FAVXX",
			wantErr: true,
		},
		{
			name:    "invalid - contains lowercase",
			opID:    "01arz3ndektsv4rrffq69g5fav",
			wantErr: true,
		},
		{
			name:    "invalid - contains I",
			opID:    "01ARZ3NDEKTSV4RRFFQ69G5FAI",
			wantErr: true,
		},
		{
			name:    "invalid - contains O",
			opID:    "01ARZ3NDEKTSV4RRFFQ69G5FAO",
			wantErr: true,
		},
		{
			name:    "invalid - contains U",
			opID:    "01ARZ3NDEKTSV4RRFFQ69G5FAU",
			wantErr: true,
		},
		{
			name:    "empty",
			opID:    "",
			wantErr: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateOpID(tc.opID)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	sessionDeckID := "01ARZ3NDEKTSV4RRFFQ69G5FAV"

	tests := []struct {
		name    string
		op      *rt.Op
		wantErr error
	}{
		{
			name: "valid op passes",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   sessionDeckID,
				BranchId: "main",
				AuthorId: "actor-1",
				Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
				ParentHlc: &rt.HLC{Physical: 999, Logical: 0},
				Payload:  []byte("test"),
				OpType:   rt.OpType_OP_TYPE_YJS_UPDATE,
			},
			wantErr: nil,
		},
		{
			name: "malformed ULID rejected",
			op: &rt.Op{
				OpId:     "BAD_ID",
				DeckId:   sessionDeckID,
				AuthorId: "actor-1",
				Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
			},
			wantErr: ErrMalformedOpID,
		},
		{
			name: "empty author_id rejected",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   sessionDeckID,
				AuthorId: "",
				Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
			},
			wantErr: ErrEmptyAuthorID,
		},
		{
			name: "missing HLC rejected",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   sessionDeckID,
				AuthorId: "actor-1",
				Hlc:      nil,
			},
			wantErr: ErrMissingHLC,
		},
		{
			name: "hlc regression rejected",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   sessionDeckID,
				AuthorId: "actor-1",
				Hlc:      &rt.HLC{Physical: 500, Logical: 0},
				ParentHlc: &rt.HLC{Physical: 1000, Logical: 0},
			},
			wantErr: ErrHLCCausal,
		},
		{
			name: "payload too large rejected",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   sessionDeckID,
				AuthorId: "actor-1",
				Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
				Payload:  make([]byte, MaxPayloadSize+1),
			},
			wantErr: ErrPayloadTooLarge,
		},
		{
			name: "deck mismatch rejected",
			op: &rt.Op{
				OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
				DeckId:   "WRONG_DECK_ID_VALUE_0000",
				AuthorId: "actor-1",
				Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
			},
			wantErr: ErrDeckMismatch,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate(tc.op, sessionDeckID)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidate_HLCEqualParent(t *testing.T) {
	// hlc == parent_hlc should be rejected (must be strictly greater)
	op := &rt.Op{
		OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		DeckId:   "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		AuthorId: "actor-1",
		Hlc:      &rt.HLC{Physical: 1000, Logical: 5},
		ParentHlc: &rt.HLC{Physical: 1000, Logical: 5},
	}
	err := Validate(op, op.DeckId)
	assert.ErrorIs(t, err, ErrHLCCausal)
}

func TestValidateAndCheckDuplicate_NoDB(t *testing.T) {
	// With nil db, ops should be accepted unconditionally
	op := &rt.Op{
		OpId:     "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		DeckId:   "01ARZ3NDEKTSV4RRFFQ69G5FAV",
		AuthorId: "actor-1",
		Hlc:      &rt.HLC{Physical: 1000, Logical: 1},
		ParentHlc: &rt.HLC{Physical: 999, Logical: 0},
		Payload:  []byte("test"),
		OpType:   rt.OpType_OP_TYPE_YJS_UPDATE,
	}
	applied, _, err := ValidateAndCheckDuplicate(nil, nil, op, op.DeckId)
	require.NoError(t, err)
	assert.True(t, applied)
}
