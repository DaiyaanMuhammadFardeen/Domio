// Package hlc implements a Hybrid Logical Clock for causally-ordered event
// timestamps in the realtime gateway.
package hlc

import (
	"errors"
	"time"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
)

var (
	// ErrCausalViolation is returned when a child HLC is not strictly greater
	// than its parent.
	ErrCausalViolation = errors.New("hlc: child must be causally after parent")
)

// Clock is an in-memory Hybrid Logical Clock.
// The tuple (physical, logical) is ordered lexicographically:
// physical carries wall-clock nanoseconds; logical breaks ties within the
// same physical tick.
type Clock struct {
	physical int64
	logical  int64
}

// New returns a Clock initialised to the current wall time.
func New() *Clock {
	return &Clock{
		physical: time.Now().UnixNano(),
		logical:  0,
	}
}

// Now returns the current HLC timestamp without advancing the counter.
func (c *Clock) Now() *rt.HLC {
	return &rt.HLC{Physical: c.physical, Logical: c.logical}
}

// Update advances the clock to be at least as large as the incoming HLC.
// If the incoming HLC is behind the current clock, the physical component
// is replaced by wall-clock time and logical is incremented.
// The updated HLC is returned.
func (c *Clock) Update(incoming *rt.HLC) *rt.HLC {
	now := time.Now().UnixNano()
	if now > c.physical {
		// Wall-clock is ahead: advance physical, reset logical.
		c.physical = now
		c.logical = 0
	} else if now == c.physical {
		// Same tick: bump logical.
		c.logical++
	}

	// Merge with incoming: take the max tuple.
	if incoming != nil && (incoming.Physical > c.physical || (incoming.Physical == c.physical && incoming.Logical > c.logical)) {
		c.physical = incoming.Physical
		c.logical = incoming.Logical
	}

	return &rt.HLC{Physical: c.physical, Logical: c.logical}
}

// FromProto initialises a clock from a protobuf HLC.
func FromProto(h *rt.HLC) *Clock {
	if h == nil {
		return New()
	}
	return &Clock{physical: h.Physical, logical: h.Logical}
}

// ToProto converts the clock to a protobuf HLC.
func (c *Clock) ToProto() *rt.HLC {
	return &rt.HLC{Physical: c.physical, Logical: c.logical}
}

// Compare orders two HLC values lexicographically:
//
//	-1 if a < b, 0 if a == b, +1 if a > b.
func Compare(a, b *rt.HLC) int {
	if a.Physical < b.Physical {
		return -1
	}
	if a.Physical > b.Physical {
		return 1
	}
	if a.Logical < b.Logical {
		return -1
	}
	if a.Logical > b.Logical {
		return 1
	}
	return 0
}

// ValidateMonotonic checks that child is strictly greater than parent
// in HLC ordering.
func ValidateMonotonic(parent, child *rt.HLC) error {
	if Compare(child, parent) != 1 {
		return ErrCausalViolation
	}
	return nil
}
