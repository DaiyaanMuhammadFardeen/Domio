// Package hash provides deterministic A/B-test assignment.
//
// The hot path of an A/B service is the assignment decision. We compute
// it as:
//
//   bucket = (xxhash64(workspace_id || 0x00 || experiment_id ||
//                      0x00 || hash_salt || 0x00 || viewer_id_key)
//             / 2^64) ∈ [0, 1)
//
// where the workspace_id, experiment_id, hash_salt, and viewer_id_key
// are concatenated with a NUL separator (to prevent "abc|def" from
// colliding with "ab|cdef"). The hash_salt comes from the ab_test row
// and isolates tests within the same workspace.
//
// We use cespare/xxhash (a 64-bit non-cryptographic hash) because:
//
//   * Sub-nanosecond cost per call — the hot path runs at sub-ms across
//     thousands of viewers per second.
//   * Zero allocation — the hash writes string bytes directly without
//     building an intermediate buffer.
//   * Good distribution across the [0, 2^64) range. We only need
//     uniformity, not cryptographic hardness, for assignment.
//
// The bucket is then mapped onto the cumulative weights of the test's
// variants. Given variants ordered by stable variant_key with weights
// [w1, w2, ..., wN] summing to 100, the variant whose cumulative
// sub-range covers bucket is the assigned variant.
package hash

import (
	"errors"

	"github.com/cespare/xxhash/v2"
)

// ErrInvalidWeights is returned when a variant weight list is empty,
// has negative weights, or sums to zero.
var ErrInvalidWeights = errors.New("hash: invalid weights")

// Assignment is the result of a deterministic assignment computation.
type Assignment struct {
	// VariantKey — the variant's stable id (e.g. "control", "variant_a").
	VariantKey string
	// Bucket in [0, 1) — the exact hash value, used for reproducibility.
	Bucket float64
	// WeightIdx — the variant's index in the input slice (for testing).
	WeightIdx int
}

// hashBucket is the lower-bound function that maps the raw 64-bit
// hash value onto [0, 1). It uses the upper 53 bits so the float64
// mantissa stays exact — without this clamp, bucket values very close
// to 1.0 lose precision (the mantissa is only 53 bits).
func hashBucket(sum uint64) float64 {
	upper := sum >> 11 // 53-bit value in [0, 2^53)
	return float64(upper) / float64(uint64(1)<<53)
}

// writeSplitKey writes workspace|experiment|salt|viewer to the digest
// with NUL separators. The NUL bytes guarantee that adjacent segments
// cannot be confused by a viewer-id swap: hash(ws="ab", exp="cd") must
// differ from hash(ws="abc", exp="d").
func writeSplitKey(d *xxhash.Digest, workspaceID, experimentID, salt, viewerIDKey string) {
	_, _ = d.WriteString(workspaceID)
	_, _ = d.WriteString("\x00")
	_, _ = d.WriteString(experimentID)
	_, _ = d.WriteString("\x00")
	_, _ = d.WriteString(salt)
	_, _ = d.WriteString("\x00")
	_, _ = d.WriteString(viewerIDKey)
}

// ComputeBucket returns the [0, 1) bucket for the given inputs. The
// function is allocation-free — strings are hashed as bytes directly.
func ComputeBucket(workspaceID, experimentID, salt, viewerIDKey string) float64 {
	d := xxhash.New()
	writeSplitKey(d, workspaceID, experimentID, salt, viewerIDKey)
	return hashBucket(d.Sum64())
}

// Assign returns the variant for the given inputs and weight list.
// weights[i] is the integer weight of variants[i] (the variant at
// index i). The weights must sum to totalWeight (typically 100).
//
// totalWeight is passed in (rather than assumed to be 100) so the
// caller can use percentages, ratios, or any other unit — the math is
// the same. Callers who want 0..100 should pass totalWeight=100.
func Assign(workspaceID, experimentID, salt, viewerIDKey string, variants []string, weights []int, totalWeight int) (Assignment, error) {
	if len(variants) == 0 || len(variants) != len(weights) {
		return Assignment{}, ErrInvalidWeights
	}
	if totalWeight <= 0 {
		return Assignment{}, ErrInvalidWeights
	}
	sum := 0
	for _, w := range weights {
		if w < 0 {
			return Assignment{}, ErrInvalidWeights
		}
		sum += w
	}
	if sum == 0 {
		return Assignment{}, ErrInvalidWeights
	}
	bucket := ComputeBucket(workspaceID, experimentID, salt, viewerIDKey)
	// Normalise the bucket to totalWeight: if a caller hands us weights
	// that already sum to totalWeight this is a no-op.
	threshold := bucket * float64(totalWeight)
	cum := 0.0
	for i, w := range weights {
		cum += float64(w)
		if threshold < cum {
			return Assignment{
				VariantKey: variants[i],
				Bucket:     bucket,
				WeightIdx:  i,
			}, nil
		}
	}
	// Floating-point rounding can land exactly at totalWeight. Fall
	// through to the last variant.
	return Assignment{
		VariantKey: variants[len(variants)-1],
		Bucket:     bucket,
		WeightIdx:  len(variants) - 1,
	}, nil
}

// HashKey returns the raw 64-bit hash as two uint32 halves. Used by
// the measurement service to derive a stable per-assignment row key
// for cross-service joins.
func HashKey(workspaceID, experimentID, salt, viewerIDKey string) (lo, hi uint32) {
	d := xxhash.New()
	writeSplitKey(d, workspaceID, experimentID, salt, viewerIDKey)
	sum := d.Sum64()
	return uint32(sum & 0xffffffff), uint32(sum >> 32)
}

// HashKeyBytes is like HashKey but hashes raw bytes — used when the
// caller already has a fully-encoded key (e.g. when measuring across
// services that join on the same identifier).
func HashKeyBytes(key []byte) (lo, hi uint32) {
	d := xxhash.New()
	_, _ = d.Write(key)
	sum := d.Sum64()
	return uint32(sum & 0xffffffff), uint32(sum >> 32)
}