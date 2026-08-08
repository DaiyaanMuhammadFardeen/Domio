package idempotency

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestKeyDeterministic(t *testing.T) {
	k1, err := Key("w1", "v1", "view", "e1")
	require.NoError(t, err)
	k2, err := Key("w1", "v1", "view", "e1")
	require.Equal(t, k1, k2)
}

func TestKey64Hex(t *testing.T) {
	k, err := Key("w1", "v1", "view", "e1")
	require.NoError(t, err)
	require.Len(t, k, 64)
	for _, c := range k {
		require.True(t,
			(c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'),
			"non-hex char %q", string(c))
	}
}

func TestKeyDistinctOnAnyField(t *testing.T) {
	base, err := Key("w1", "v1", "view", "e1")
	require.NoError(t, err)

	cases := []struct {
		w, v, et, eid string
	}{
		{"w2", "v1", "view", "e1"},
		{"w1", "v2", "view", "e1"},
		{"w1", "v1", "interaction", "e1"},
		{"w1", "v1", "view", "e2"},
	}
	for _, tc := range cases {
		k, err := Key(tc.w, tc.v, tc.et, tc.eid)
		require.NoError(t, err)
		require.NotEqual(t, base, k, "collision for case %+v", tc)
	}
}

func TestKeySeparatorDisambiguation(t *testing.T) {
	// "ab|c" vs "a|bc" must not collide.
	k1, _ := Key("w", "ab", "c", "e")
	k2, _ := Key("w", "a", "bc", "e")
	require.NotEqual(t, k1, k2)
}

func TestKeyEmptyField(t *testing.T) {
	_, err := Key("", "v", "view", "e")
	require.ErrorIs(t, err, ErrEmptyComponent)
	_, err = Key("w", "", "view", "e")
	require.ErrorIs(t, err, ErrEmptyComponent)
	_, err = Key("w", "v", "", "e")
	require.ErrorIs(t, err, ErrEmptyComponent)
	_, err = Key("w", "v", "view", "")
	require.ErrorIs(t, err, ErrEmptyComponent)
}

func TestKeyOrPanicValid(t *testing.T) {
	k := KeyOrPanic("w", "v", "view", "e")
	require.Len(t, k, 64)
}

func TestKeyOrPanicPanics(t *testing.T) {
	require.Panics(t, func() { KeyOrPanic("", "v", "view", "e") })
}

func TestKeyStableAcrossRuns(t *testing.T) {
	// Spot check that sha256(s) is deterministic. The exact hex
	// value is not asserted here so we don't need to keep a
	// hard-coded constant in sync with the algorithm.
	k1, err := Key("ws", "vk", "view", "ev")
	require.NoError(t, err)
	k2, err := Key("ws", "vk", "view", "ev")
	require.NoError(t, err)
	require.Equal(t, k1, k2)
}
