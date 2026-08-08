// Package model holds the domain types for the benchmark service.
//
// The DB tables backing these types live in:
//
//   infrastructure/clickhouse/init/007_phase17_benchmark.sql   (warehouse)
//   infrastructure/postgres/migrations/0063_analytics_benchmarks.up.sql
//                                                            (mirror + audit)
package model

import (
	"time"

	"github.com/google/uuid"
)

// InferenceMethod is the statistical test used to compare two samples.
//
//   'welch_t'        — Welch's t-test (unequal variances).
//   'mann_whitney'   — Mann-Whitney U (non-parametric).
//   'bayesian_normal' — Conjugate normal-normal with known variance.
type InferenceMethod string

const (
	MethodWelchT         InferenceMethod = "welch_t"
	MethodMannWhitney    InferenceMethod = "mann_whitney"
	MethodBayesianNormal InferenceMethod = "bayesian_normal"
)

// BenchmarkStatus — string-typed to match the Postgres CHECK constraint.
type BenchmarkStatus string

const (
	BenchmarkStatusActive    BenchmarkStatus = "active"
	BenchmarkStatusArchived  BenchmarkStatus = "archived"
	BenchmarkStatusDraft     BenchmarkStatus = "draft"
)

// Benchmark is the registered comparison definition. A benchmark pairs
// two sample populations (a and b) on a single metric and stores the
// most recent inference results.
type Benchmark struct {
	BenchmarkID  uuid.UUID       `json:"benchmark_id"`
	WorkspaceID  uuid.UUID       `json:"workspace_id"`
	Name         string          `json:"name"`
	Description  string          `json:"description,omitempty"`
	MetricName   string          `json:"metric_name"`           // e.g. 'session_dwell_ms'
	VariantAKey  string          `json:"variant_a_key"`         // e.g. 'control'
	VariantBKey  string          `json:"variant_b_key"`         // e.g. 'treatment'
	Method       InferenceMethod `json:"method"`                // 'welch_t' | 'mann_whitney' | 'bayesian_normal'
	Status       BenchmarkStatus `json:"status"`
	SignSalt     string          `json:"-"`                     // HMAC salt for payload signing
	ChainPrev    *uuid.UUID      `json:"chain_prev,omitempty"`  // optional chain pointer
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	CreatedBy    *uuid.UUID      `json:"created_by,omitempty"`
}

// BenchmarkMetric is the raw time-series metric input for a benchmark.
// Rows are pushed by the warehouse pipelines into ClickHouse
// benchmark_metric and mirrored to Postgres.
type BenchmarkMetric struct {
	WorkspaceID  uuid.UUID `json:"workspace_id"`
	BenchmarkID  uuid.UUID `json:"benchmark_id"`
	MetricName   string    `json:"metric_name"`
	Value        float64   `json:"value"`
	TSMs         int64     `json:"ts_ms"`            // unix ms
	Cohort       string    `json:"cohort,omitempty"` // 'a' | 'b'
}

// BenchmarkSnapshot is a periodic rollup of a (benchmark, metric, day).
// Snapshots are produced by the analytics warehouse and written to
// ClickHouse benchmark_snapshot via WriteSnapshot.
type BenchmarkSnapshot struct {
	WorkspaceID  uuid.UUID `json:"workspace_id"`
	BenchmarkID  uuid.UUID `json:"benchmark_id"`
	MetricName   string    `json:"metric_name"`
	BucketDate   time.Time `json:"bucket_date"` // truncated to day
	Value        float64   `json:"value"`
	SampleSize   uint32    `json:"sample_size"`
	RegionPinned string    `json:"region_pinned,omitempty"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BenchmarkRun is the record of one inference computation against a
// benchmark. The signature is reproducible from
// (benchmark_id, sample_a, sample_b, method).
type BenchmarkRun struct {
	RunID        uuid.UUID       `json:"run_id"`
	WorkspaceID  uuid.UUID       `json:"workspace_id"`
	BenchmarkID  uuid.UUID       `json:"benchmark_id"`
	Method       InferenceMethod `json:"method"`
	SampleSizeA  int             `json:"sample_size_a"`
	SampleSizeB  int             `json:"sample_size_b"`
	Result       InferenceResult `json:"result"`
	ComputedAt   time.Time       `json:"computed_at"`
}

// BenchmarkFilter scopes a List call. Empty fields mean "any".
type BenchmarkFilter struct {
	WorkspaceID uuid.UUID
	Status      BenchmarkStatus
	Method      InferenceMethod
	Limit       int
	Offset      int
}

// InferenceResult is the shape returned by the inference dispatcher.
// All three methods populate PValueBayesian (or PValue); the dedicated
// fields are method-specific.
type InferenceResult struct {
	Method InferenceMethod `json:"method"`

	// Welch's t-test output.
	TStatistic     float64 `json:"t_statistic,omitempty"`
	DegreesOfFreedom float64 `json:"degrees_of_freedom,omitempty"`

	// Mann-Whitney U output.
	UStatistic float64 `json:"u_statistic,omitempty"`

	// Bayesian output.
	PosteriorMeanA float64 `json:"posterior_mean_a,omitempty"`
	PosteriorMeanB float64 `json:"posterior_mean_b,omitempty"`
	PosteriorVarA  float64 `json:"posterior_var_a,omitempty"`
	PosteriorVarB  float64 `json:"posterior_var_b,omitempty"`
	CredibleLow    float64 `json:"credible_low,omitempty"`
	CredibleHigh   float64 `json:"credible_high,omitempty"`
	PBetterThanA   float64 `json:"p_better_than_a,omitempty"`

	// Common shape.
	MeanA float64 `json:"mean_a"`
	MeanB float64 `json:"mean_b"`
	VarA  float64 `json:"var_a"`
	VarB  float64 `json:"var_b"`
	NA    int     `json:"n_a"`
	NB    int     `json:"n_b"`
	// PValue is the frequentist p-value (Welch, Mann-Whitney) when
	// applicable. For Bayesian, callers should use PBetterThanA.
	PValue       float64 `json:"p_value"`
	EffectSigned float64 `json:"effect_signed"` // signed effect direction
}