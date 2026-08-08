// Package hlc implements a hybrid logical clock for the participant
// WS gateway. Mirrors services/realtime-gateway/internal/hlc.
package hlc

import (
	"sync/atomic"
	"time"
)

// Pack is a 64-bit HLC: [physical_ms:48][logical:16]. Packed form is
// cheap to compare and transmit.
type Pack uint64

const (
	physicalBits = 48
	logicalBits  = 16
	logicalMask  = uint64(1)<<logicalBits - 1
)

// Clock is a thread-safe HLC.
type Clock struct {
	last atomic.Uint64
	now  func() time.Time
}

// New creates an HLC anchored at `now()` (default = time.Now).
func New(now func() time.Time) *Clock {
	if now == nil {
		now = time.Now
	}
	return &Clock{now: now}
}

// Now returns the current HLC value, advancing it past any prior pack.
func (c *Clock) Now() Pack {
	now := c.now()
	for {
		physical := uint64(now.UnixMilli()) & ((uint64(1) << physicalBits) - 1)
		last := c.last.Load()
		lastPhysical := last >> logicalBits
		lastLogical := last & logicalMask

		var nextLogical uint64
		var nextPhysical uint64
		switch {
		case physical > lastPhysical:
			nextPhysical = physical
			nextLogical = 0
		case physical == lastPhysical:
			nextPhysical = lastPhysical
			nextLogical = lastLogical + 1
		default:
			nextPhysical = lastPhysical
			nextLogical = lastLogical + 1
		}
		next := (nextPhysical << logicalBits) | (nextLogical & logicalMask)
		if c.last.CompareAndSwap(last, next) {
			return Pack(next)
		}
	}
}

// Physical extracts the physical-ms portion of a pack.
func (p Pack) Physical() int64 { return int64(p >> logicalBits) }

// Logical extracts the logical counter portion.
func (p Pack) Logical() uint64 { return uint64(p) & logicalMask }

// Compare returns -1/0/1 like strings.Compare.
func (p Pack) Compare(other Pack) int {
	switch {
	case p < other:
		return -1
	case p > other:
		return 1
	default:
		return 0
	}
}