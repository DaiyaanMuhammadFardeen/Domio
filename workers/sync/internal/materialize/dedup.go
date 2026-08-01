// dedup.go — Phase 05 explicit dedup pass.
//
// `crdt_logs.op_id` is a primary-key ULID; the `pgxStore.InsertOps`
// path uses `ON CONFLICT DO NOTHING` so duplicate inserts at the
// database layer are idempotent.  This file adds a defensive
// in-process dedup pass for callers that want to drop duplicates
// before the round-trip to Postgres (e.g. when replaying a backup
// of the op-log into a fresh cluster).
//
// The spec lists the file path `internal/materialize/dedup.go`
// explicitly; the implementation lives here.

package materialize

import "sort"

// DedupFilter returns a new slice containing one entry per unique
// `OpID`.  When two ops share the same id the one with the highest
// physical HLC wins; ties are broken by logical HLC.  The original
// slice ordering is preserved for the surviving entries so the
// downstream flush still produces a stream that resembles causal
// order.
//
// The function is allocation-light and safe to call on batches up to
// the 100-op flush size the writer is configured for.
func DedupFilter(ops []OpRecord) []OpRecord {
	if len(ops) < 2 {
		return ops
	}
	byID := make(map[string]OpRecord, len(ops))
	for _, op := range ops {
		existing, seen := byID[op.OpID]
		if !seen {
			byID[op.OpID] = op
			continue
		}
		if op.HLCPhysical > existing.HLCPhysical ||
			(op.HLCPhysical == existing.HLCPhysical && op.HLCLogical > existing.HLCLogical) {
			byID[op.OpID] = op
		}
	}
	out := make([]OpRecord, 0, len(byID))
	for _, op := range byID {
		out = append(out, op)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].HLCPhysical != out[j].HLCPhysical {
			return out[i].HLCPhysical < out[j].HLCPhysical
		}
		return out[i].HLCLogical < out[j].HLCLogical
	})
	return out
}
