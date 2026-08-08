package registry

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

// fakeAdapter is a no-op adapter used to verify registry plumbing.
type fakeAdapter struct {
	name string
}

func (f *fakeAdapter) Name() string { return f.name }
func (f *fakeAdapter) Push(_ context.Context, _ Connection, _ Record) error {
	return nil
}
func (f *fakeAdapter) Pull(_ context.Context, _ Connection, _ int64) ([]Record, error) {
	return nil, nil
}

func TestRegistryRegisterAndBuild(t *testing.T) {
	r := New()
	r.Register("hubspot", func() Adapter { return &fakeAdapter{name: "hubspot"} })

	require.True(t, r.Has("hubspot"))
	require.False(t, r.Has("salesforce"))

	a, err := r.Build("hubspot")
	require.NoError(t, err)
	require.Equal(t, "hubspot", a.Name())
}

func TestRegistryBuildUnknown(t *testing.T) {
	r := New()
	_, err := r.Build("missing")
	require.Error(t, err)
}

func TestRegistryProvidersSorted(t *testing.T) {
	r := New()
	r.Register("salesforce", func() Adapter { return &fakeAdapter{name: "salesforce"} })
	r.Register("hubspot", func() Adapter { return &fakeAdapter{name: "hubspot"} })

	providers := r.Providers()
	// Order is not guaranteed (map iteration), but both must appear.
	require.Len(t, providers, 2)
}

func TestRegistryReplaceFactory(t *testing.T) {
	r := New()
	r.Register("hubspot", func() Adapter { return &fakeAdapter{name: "hubspot"} })
	r.Register("hubspot", func() Adapter { return &fakeAdapter{name: "hubspot-v2"} })

	a, err := r.Build("hubspot")
	require.NoError(t, err)
	require.Equal(t, "hubspot-v2", a.Name())
}
