package hlc

import (
	"testing"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompare(t *testing.T) {
	tests := []struct {
		name     string
		a, b     *rt.HLC
		expected int
	}{
		{
			name:     "equal",
			a:        &rt.HLC{Physical: 100, Logical: 5},
			b:        &rt.HLC{Physical: 100, Logical: 5},
			expected: 0,
		},
		{
			name:     "physical less",
			a:        &rt.HLC{Physical: 100, Logical: 5},
			b:        &rt.HLC{Physical: 200, Logical: 1},
			expected: -1,
		},
		{
			name:     "physical greater",
			a:        &rt.HLC{Physical: 200, Logical: 1},
			b:        &rt.HLC{Physical: 100, Logical: 5},
			expected: 1,
		},
		{
			name:     "same physical, logical less",
			a:        &rt.HLC{Physical: 100, Logical: 3},
			b:        &rt.HLC{Physical: 100, Logical: 5},
			expected: -1,
		},
		{
			name:     "same physical, logical greater",
			a:        &rt.HLC{Physical: 100, Logical: 7},
			b:        &rt.HLC{Physical: 100, Logical: 5},
			expected: 1,
		},
		{
			name:     "zero values",
			a:        &rt.HLC{},
			b:        &rt.HLC{},
			expected: 0,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Compare(tc.a, tc.b)
			assert.Equal(t, tc.expected, got)
		})
	}
}

func TestValidateMonotonic(t *testing.T) {
	tests := []struct {
		name    string
		parent  *rt.HLC
		child   *rt.HLC
		wantErr bool
	}{
		{
			name:    "child greater physical",
			parent:  &rt.HLC{Physical: 100, Logical: 0},
			child:   &rt.HLC{Physical: 101, Logical: 0},
			wantErr: false,
		},
		{
			name:    "child greater logical same physical",
			parent:  &rt.HLC{Physical: 100, Logical: 5},
			child:   &rt.HLC{Physical: 100, Logical: 6},
			wantErr: false,
		},
		{
			name:    "child equal to parent",
			parent:  &rt.HLC{Physical: 100, Logical: 5},
			child:   &rt.HLC{Physical: 100, Logical: 5},
			wantErr: true,
		},
		{
			name:    "child less than parent",
			parent:  &rt.HLC{Physical: 200, Logical: 0},
			child:   &rt.HLC{Physical: 100, Logical: 99},
			wantErr: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateMonotonic(tc.parent, tc.child)
			if tc.wantErr {
				assert.ErrorIs(t, err, ErrCausalViolation)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestClockUpdate(t *testing.T) {
	c := New()
	h1 := c.Now()
	assert.Greater(t, h1.Physical, int64(0))

	// Update with an HLC that is behind the clock — should still advance.
	h2 := c.Update(&rt.HLC{Physical: 0, Logical: 0})
	assert.True(t, Compare(h2, h1) == 1, "updated HLC should be after initial")

	// Update with an HLC that is ahead of wall-clock — should adopt it.
	future := &rt.HLC{Physical: h1.Physical + 999_000_000_000, Logical: 42}
	h3 := c.Update(future)
	assert.Equal(t, future.Physical, h3.Physical)
	assert.Equal(t, future.Logical, h3.Logical)
}

func TestClockFromProtoToProto(t *testing.T) {
	original := &rt.HLC{Physical: 1234567890, Logical: 99}
	c := FromProto(original)
	got := c.ToProto()
	assert.Equal(t, original.Physical, got.Physical)
	assert.Equal(t, original.Logical, got.Logical)
}

func TestClockFromProtoNil(t *testing.T) {
	c := FromProto(nil)
	h := c.Now()
	assert.Greater(t, h.Physical, int64(0))
}

func TestClockMonotonicAfterUpdates(t *testing.T) {
	c := New()
	prev := c.Now()
	for i := 0; i < 100; i++ {
		cur := c.Update(&rt.HLC{Physical: prev.Physical, Logical: prev.Logical})
		require.NoError(t, ValidateMonotonic(prev, cur), "iteration %d", i)
		prev = cur
	}
}
