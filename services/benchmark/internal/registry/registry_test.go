package registry

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/model"
	"github.com/domio/platform/services/benchmark/internal/store"
)

func goodBench(ws uuid.UUID, name string) model.Benchmark {
	return model.Benchmark{
		WorkspaceID: ws,
		Name:        name,
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      model.MethodWelchT,
	}
}

func TestRegisterAndGet(t *testing.T) {
	t.Parallel()
	svc := New(nil) // uses seeded in-memory store
	ctx := context.Background()
	ws := uuid.New()

	b := goodBench(ws, "register-and-get")
	got, err := svc.Register(ctx, b)
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, got.BenchmarkID)
	require.NotEmpty(t, got.SignSalt, "salt must be minted when missing")

	fetched, err := svc.Get(ctx, ws, got.BenchmarkID)
	require.NoError(t, err)
	assert.Equal(t, got.Name, fetched.Name)
}

func TestRegisterValidation(t *testing.T) {
	t.Parallel()
	svc := New(nil)
	ctx := context.Background()
	ws := uuid.New()

	cases := []struct {
		name string
		mut  func(b *model.Benchmark)
	}{
		{"no name", func(b *model.Benchmark) { b.Name = "" }},
		{"no metric", func(b *model.Benchmark) { b.MetricName = "" }},
		{"no variant a", func(b *model.Benchmark) { b.VariantAKey = "" }},
		{"no variant b", func(b *model.Benchmark) { b.VariantBKey = "" }},
		{"bad method", func(b *model.Benchmark) { b.Method = "z_test" }},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			b := goodBench(ws, "validate-"+c.name)
			c.mut(&b)
			_, err := svc.Register(ctx, b)
			require.Error(t, err)
			assert.True(t, errors.Is(err, ErrInvalidPayload))
		})
	}
}

func TestSignPayloadDeterministic(t *testing.T) {
	t.Parallel()
	ws := uuid.New()
	a := goodBench(ws, "sign-det")
	a.SignSalt = "fixed-salt"
	a.BenchmarkID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	sig1, err := New(nil).SignPayload(a)
	require.NoError(t, err)
	sig2, err := New(nil).SignPayload(a)
	require.NoError(t, err)
	assert.Equal(t, sig1, sig2, "SignPayload must be deterministic")

	// Mutating any signed field changes the signature.
	b := a
	b.Name = "different-name"
	sig3, err := New(nil).SignPayload(b)
	require.NoError(t, err)
	assert.NotEqual(t, sig1, sig3)
}

func TestVerifySignature(t *testing.T) {
	t.Parallel()
	ws := uuid.New()
	a := goodBench(ws, "verify-sig")
	a.SignSalt = "salt"
	a.BenchmarkID = uuid.MustParse("00000000-0000-0000-0000-000000000002")

	svc := New(nil)
	sig, err := svc.SignPayload(a)
	require.NoError(t, err)

	ok, err := svc.VerifySignature(a, sig)
	require.NoError(t, err)
	assert.True(t, ok)

	// Tamper: change a field, signature must not match.
	tampered := a
	tampered.Name = "tampered"
	ok, err = svc.VerifySignature(tampered, sig)
	require.NoError(t, err)
	assert.False(t, ok)

	// Wrong-length signature cannot match.
	ok, err = svc.VerifySignature(a, "deadbeef")
	require.NoError(t, err)
	assert.False(t, ok)
}

// Sanity: the seeded fixtures from store.NewSeededInMemoryStore are
// reachable through the registry layer.
func TestListSeededFixtures(t *testing.T) {
	t.Parallel()
	svc := New(store.NewSeededInMemoryStore())
	ws := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	list, err := svc.List(context.Background(), model.BenchmarkFilter{WorkspaceID: ws})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(list), 2)
}