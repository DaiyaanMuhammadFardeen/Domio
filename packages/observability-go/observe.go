package observe

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Mode describes whether the SDK is exporting telemetry or in no-op mode.
type Mode string

const (
	ModeOTLP Mode = "otlp"
	ModeNoop Mode = "noop"
)

var noopTokens = map[string]struct{}{
	"":         {},
	"none":     {},
	"noop":     {},
	"disabled": {},
	"off":      {},
	"false":    {},
}

// Resource is the set of resource attributes attached to every emitted
// payload. The four fields below are required by Phase 01 §5.B.3;
// the remaining are optional.
type Resource struct {
	ServiceName        string `json:"service.name"`
	ServiceVersion     string `json:"service.version"`
	ServiceNamespace   string `json:"service.namespace,omitempty"`
	DeploymentEnv      string `json:"deployment.environment"`
	GitSHA             string `json:"git.sha"`
	HostName           string `json:"host.name,omitempty"`
	extraKeys          []string
	extraValues        []string
}

// SetExtra adds a custom resource attribute. Callers must validate
// their own keys and values; NewResource performs reasonable sanity
// checks on the four required fields.
func (r *Resource) SetExtra(key, value string) {
	if key == "" || value == "" {
		return
	}
	r.extraKeys = append(r.extraKeys, key)
	r.extraValues = append(r.extraValues, value)
}

// OtlpPair is the JSON wire representation of an OTLP attribute key/value.
type OtlpPair struct {
	Key   string         `json:"key"`
	Value map[string]any `json:"value"`
}

// OtlpResource is the JSON wire representation of the OTLP `Resource`
// message.
type OtlpResource struct {
	Attributes []OtlpPair `json:"attributes"`
}

// toOtlp converts the resource into its OTLP wire form.
func (r Resource) toOtlp() OtlpResource {
	pairs := []OtlpPair{
		{Key: "service.name", Value: map[string]any{"stringValue": r.ServiceName}},
		{Key: "service.version", Value: map[string]any{"stringValue": r.ServiceVersion}},
		{Key: "deployment.environment", Value: map[string]any{"stringValue": r.DeploymentEnv}},
		{Key: "git.sha", Value: map[string]any{"stringValue": r.GitSHA}},
	}
	if r.ServiceNamespace != "" {
		pairs = append(pairs, OtlpPair{Key: "service.namespace", Value: map[string]any{"stringValue": r.ServiceNamespace}})
	}
	if r.HostName != "" {
		pairs = append(pairs, OtlpPair{Key: "host.name", Value: map[string]any{"stringValue": r.HostName}})
	}
	for i, k := range r.extraKeys {
		pairs = append(pairs, OtlpPair{Key: k, Value: map[string]any{"stringValue": r.extraValues[i]}})
	}
	return OtlpResource{Attributes: pairs}
}

// ResourceOptions carries the values needed to build a resource.
type ResourceOptions struct {
	ServiceName      string
	ServiceVersion   string
	ServiceNamespace string
	Environment      string
	GitSHA           string
	HostName         string
}

const (
	maxKeyLen = 256
	maxValLen = 1024
	gitShaLen = 40
)

// ResourceError is returned when a resource fails validation.
type ResourceError struct{ Reason string }

func (e *ResourceError) Error() string { return "resource: " + e.Reason }

// NewResource builds and validates a Resource from the given options.
// Environment variables (DOMIO_ENV, GIT_SHA, GITHUB_SHA,
// DOMIO_SERVICE_VERSION) are read for defaults when a field is empty.
func NewResource(opts ResourceOptions) (Resource, error) {
	if !resourceKeyRE.MatchString(opts.ServiceName) || len(opts.ServiceName) > maxKeyLen {
		return Resource{}, &ResourceError{Reason: fmt.Sprintf("service.name %q does not match %s or is too long", opts.ServiceName, resourceKeyRE)}
	}
	if v := opts.ServiceVersion; v == "" {
		opts.ServiceVersion = envOr("DOMIO_SERVICE_VERSION", "0.0.0+unknown")
	}
	if v := opts.Environment; v == "" {
		opts.Environment = firstNonEmpty(os.Getenv("DOMIO_ENV"), os.Getenv("NODE_ENV"), "development")
	}
	if v := opts.GitSHA; v == "" {
		v = firstNonEmpty(os.Getenv("GIT_SHA"), os.Getenv("GITHUB_SHA"), "unknown")
		opts.GitSHA = v
	}
	if opts.GitSHA != "unknown" {
		if len(opts.GitSHA) < 7 || len(opts.GitSHA) > 64 || !gitSHARe.MatchString(opts.GitSHA) {
			return Resource{}, &ResourceError{Reason: fmt.Sprintf("git.sha %q is not a 7..64 char hex string", opts.GitSHA)}
		}
	}
	return Resource{
		ServiceName:      opts.ServiceName,
		ServiceVersion:   opts.ServiceVersion,
		ServiceNamespace: opts.ServiceNamespace,
		DeploymentEnv:    opts.Environment,
		GitSHA:           opts.GitSHA,
		HostName:         opts.HostName,
	}, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

var (
	resourceKeyRE = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.-]*$`)
	gitSHARe      = regexp.MustCompile(`^[0-9a-fA-F]+$`)
	metricNameRE  = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.]*$`)
)

// EndpointError is returned when an OTLP endpoint URL is malformed.
type EndpointError struct{ Reason string }

func (e *EndpointError) Error() string { return "endpoint: " + e.Reason }

// ParseOtlpEndpoint validates and parses an OTLP endpoint URL. Empty
// strings and non-http(s) schemes are rejected.
func ParseOtlpEndpoint(raw string) (*url.URL, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, &EndpointError{Reason: "OTLP endpoint must not be empty"}
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, &EndpointError{Reason: fmt.Sprintf("OTLP endpoint is not a valid URL: %s", raw)}
	}
	switch u.Scheme {
	case "http", "https":
	default:
		return nil, &EndpointError{Reason: fmt.Sprintf("OTLP endpoint must use http(s); got %q", u.Scheme)}
	}
	if u.Host == "" {
		return nil, &EndpointError{Reason: "OTLP endpoint is missing host"}
	}
	return u, nil
}

// InitOptions carries the optional settings for New().
type InitOptions struct {
	Resource      ResourceOptions
	Endpoint      string
	Headers       map[string]string
	HTTPClient    *http.Client
	Paths         OtlpPaths
}

// OtlpPaths lets callers override the default OTLP/HTTP paths.
type OtlpPaths struct {
	Traces  string
	Metrics string
	Logs    string
}

func (p OtlpPaths) forSignal(s signal) string {
	switch s {
	case signalTraces:
		if p.Traces != "" {
			return p.Traces
		}
		return "/v1/traces"
	case signalMetrics:
		if p.Metrics != "" {
			return p.Metrics
		}
		return "/v1/metrics"
	case signalLogs:
		if p.Logs != "" {
			return p.Logs
		}
		return "/v1/logs"
	}
	return "/v1/unknown"
}

type signal int

const (
	signalTraces signal = iota
	signalMetrics
	signalLogs
)

func (s signal) String() string {
	switch s {
	case signalTraces:
		return "traces"
	case signalMetrics:
		return "metrics"
	case signalLogs:
		return "logs"
	default:
		return "unknown"
	}
}

// Tracer accumulates spans and flushes them to OTLP/HTTP on demand.
type Tracer struct {
	resource Resource
	exporter *exporter // nil in noop mode
	mu       sync.Mutex
	// buf holds pointers to *Span so that mutations on the public Span
	// (e.g. RecordException appending events) propagate to the exporter
	// at Flush time without us needing to copy fields back and forth.
	buf    []*Span
	closed bool
}

// Meter accumulates counters/histograms and flushes them to OTLP/HTTP.
type Meter struct {
	resource Resource
	exporter *exporter
	mu       sync.Mutex
	counters map[string]*counterState
	hists    map[string]*histogramState
	closed   bool
}

// Logger accumulates log records and flushes them to OTLP/HTTP.
type Logger struct {
	resource Resource
	exporter *exporter
	mu       sync.Mutex
	queue    []logRecord
	closed   bool
}

// Observability bundles the three signal APIs.
type Observability struct {
	Mode    Mode
	Resource Resource
	Tracer  *Tracer
	Meter   *Meter
	Logger  *Logger
}

// IsExporting reports whether telemetry is being exported.
func (o *Observability) IsExporting() bool { return o.Mode == ModeOTLP }

// Shutdown flushes all signals and closes the underlying exporter.
// Idempotent. The exporter is shared across the three signals
// (Tracer/Meter/Logger), so we close it exactly once at the very end —
// otherwise the second signal's flush would race against the first
// signal's exporter shutdown.
func (o *Observability) Shutdown(ctx context.Context) error {
	var errs []error
	if err := o.Tracer.shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := o.Meter.shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := o.Logger.shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	// Close the shared exporter last, exactly once.
	if o.Tracer != nil && o.Tracer.exporter != nil {
		o.Tracer.exporter.shutdown()
	}
	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}

// New initializes the SDK. When the OTLP endpoint is unset, empty, or
// matches a noop token (none/noop/disabled/off/false), the returned
// Observability is in ModeNoop and every flush is a no-op.
func New(opts InitOptions) (*Observability, error) {
	res, err := NewResource(opts.Resource)
	if err != nil {
		return nil, err
	}
	endpoint := opts.Endpoint
	if endpoint == "" {
		endpoint = os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	}
	if _, ok := noopTokens[strings.ToLower(strings.TrimSpace(endpoint))]; ok {
		return noopBundle(res), nil
	}
	u, err := ParseOtlpEndpoint(endpoint)
	if err != nil {
		return nil, err
	}
	exp := newExporter(u, opts.Headers, opts.HTTPClient, opts.Paths)
	return &Observability{
		Mode:     ModeOTLP,
		Resource: res,
		Tracer:   &Tracer{resource: res, exporter: exp},
		Meter:    &Meter{resource: res, exporter: exp, counters: map[string]*counterState{}, hists: map[string]*histogramState{}},
		Logger:   &Logger{resource: res, exporter: exp},
	}, nil
}

func noopBundle(res Resource) *Observability {
	return &Observability{
		Mode:     ModeNoop,
		Resource: res,
		Tracer:   &Tracer{resource: res, exporter: nil},
		Meter:    &Meter{resource: res, exporter: nil, counters: map[string]*counterState{}, hists: map[string]*histogramState{}},
		Logger:   &Logger{resource: res, exporter: nil},
	}
}

// exporter wraps an OTLP/HTTP POST against the configured endpoint.
type exporter struct {
	baseURL *url.URL
	paths   OtlpPaths
	headers map[string]string
	client  *http.Client
	closed  bool
	mu      sync.Mutex
}

func newExporter(baseURL *url.URL, headers map[string]string, client *http.Client, paths OtlpPaths) *exporter {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	if paths.Traces == "" {
		paths.Traces = "/v1/traces"
	}
	if paths.Metrics == "" {
		paths.Metrics = "/v1/metrics"
	}
	if paths.Logs == "" {
		paths.Logs = "/v1/logs"
	}
	return &exporter{baseURL: baseURL, paths: paths, headers: headers, client: client}
}

func (e *exporter) export(ctx context.Context, s signal, body any) error {
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return errors.New("observe: exporter is closed")
	}
	e.mu.Unlock()

	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("observe: marshal payload: %w", err)
	}
	u := *e.baseURL
	u.Path = e.paths.forSignal(s)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("observe: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range e.headers {
		req.Header.Set(k, v)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("observe: send request: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("observe: OTLP %s returned HTTP %d", s, resp.StatusCode)
	}
	return nil
}

func (e *exporter) shutdown() {
	e.mu.Lock()
	e.closed = true
	e.mu.Unlock()
}

// SetHeader attaches an HTTP header to every outgoing OTLP request.
// Callers may use this for Authorization or tenant scoping.
func (e *exporter) setHeader(k, v string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.headers == nil {
		e.headers = map[string]string{}
	}
	e.headers[k] = v
}

// Endpoint returns the configured base URL (no path).
func (e *exporter) endpoint() string {
	u := *e.baseURL
	u.Path = ""
	return u.String()
}

// Span represents an in-flight span. It is created via Tracer.StartSpan.
type Span struct {
	TraceID    string
	SpanID     string
	Name       string
	Kind       string
	StartTime  time.Time
	EndTime    time.Time
	Attributes map[string]any
	Status     spanStatus
	Events     []spanEvent
	ParentID   string
	ended      bool
}

type spanStatus struct {
	Code    string
	Message string
}

type spanEvent struct {
	Name       string
	Time       time.Time
	Attributes map[string]any
}

// SetAttribute mutates an attribute on the span.
func (s *Span) SetAttribute(key string, value any) {
	if s.Attributes == nil {
		s.Attributes = map[string]any{}
	}
	s.Attributes[key] = value
}

// RecordException records an exception on the span and sets status=error.
func (s *Span) RecordException(err error) {
	msg := err.Error()
	if len(msg) > 256 {
		msg = msg[:256]
	}
	s.Events = append(s.Events, spanEvent{
		Name:       "exception",
		Time:       time.Now(),
		Attributes: map[string]any{"exception.message": msg},
	})
	s.Status = spanStatus{Code: "error", Message: msg}
}

// SetStatus sets the explicit status of the span.
func (s *Span) SetStatus(code, message string) {
	s.Status = spanStatus{Code: code, Message: message}
}

// End marks the span as complete. Idempotent.
func (s *Span) End(t ...time.Time) {
	if s.ended {
		return
	}
	s.ended = true
	if len(t) > 0 {
		s.EndTime = t[0]
	} else {
		s.EndTime = time.Now()
	}
}

type span struct {
	traceID    string
	spanID     string
	parentID   string
	name       string
	kind       string
	startMs    int64
	endMs      int64
	attrs      map[string]any
	status     spanStatus
	events     []spanEvent
}

// Note: the internal `span` struct above is kept for backwards
// compatibility with any external code that may have referenced it
// during the type alias period. The Tracer now buffers *Span directly.

// StartSpan creates and registers a new span with the tracer. The span
// is held in an internal buffer until Flush is called. The returned
// *Span is the same pointer that lives in the buffer, so mutating
// fields on the Span (via SetAttribute / RecordException / SetStatus /
// End) propagates to the next Flush.
func (t *Tracer) StartSpan(name string, opts ...SpanOptions) *Span {
	t.mu.Lock()
	defer t.mu.Unlock()
	traceID := randomHex(32)
	spanID := randomHex(16)
	now := time.Now().UnixMilli()
	s := &Span{
		TraceID:    traceID,
		SpanID:     spanID,
		Name:       name,
		Kind:       "internal",
		StartTime:  time.UnixMilli(now),
		Attributes: map[string]any{},
	}
	o := SpanOptions{}
	if len(opts) > 0 {
		o = opts[0]
		s.ParentID = o.ParentSpanID
		if o.TraceID != "" {
			s.TraceID = o.TraceID
		}
		if o.Kind != "" {
			s.Kind = o.Kind
		}
		if !o.StartTime.IsZero() {
			s.StartTime = o.StartTime
		}
		for k, v := range o.Attributes {
			s.Attributes[k] = v
		}
	}
	t.buf = append(t.buf, s)
	return s
}

// SpanOptions is the optional argument to StartSpan.
type SpanOptions struct {
	TraceID     string
	ParentSpanID string
	Kind        string
	StartTime   time.Time
	Attributes  map[string]any
}

// Flush ships every buffered span to the OTLP endpoint in one POST.
func (t *Tracer) Flush(ctx context.Context) error {
	t.mu.Lock()
	if t.exporter == nil {
		t.mu.Unlock()
		return nil
	}
	if len(t.buf) == 0 {
		t.mu.Unlock()
		return nil
	}
	batch := t.buf
	t.buf = nil
	t.mu.Unlock()

	otlpSpans := make([]map[string]any, 0, len(batch))
	for _, s := range batch {
		ev := make([]map[string]any, 0, len(s.Events))
		for _, e := range s.Events {
			ev = append(ev, map[string]any{
				"timeUnixNano": fmt.Sprintf("%d", e.Time.UnixNano()),
				"name":         e.Name,
				"attributes":   toOtlpAttrs(e.Attributes),
			})
		}
		spanObj := map[string]any{
			"traceId":           s.TraceID,
			"spanId":            s.SpanID,
			"name":              s.Name,
			"kind":              kindToOtlp(s.Kind),
			"startTimeUnixNano": fmt.Sprintf("%d", s.StartTime.UnixNano()),
			"endTimeUnixNano":   fmt.Sprintf("%d", s.EndTime.UnixNano()),
			"attributes":        toOtlpAttrs(s.Attributes),
			"events":            ev,
			"status":            statusToOtlp(s.Status),
		}
		if s.ParentID != "" {
			spanObj["parentSpanId"] = s.ParentID
		}
		otlpSpans = append(otlpSpans, spanObj)
	}
	payload := map[string]any{
		"resourceSpans": []map[string]any{
			{
				"resource": t.resource.toOtlp(),
				"scopeSpans": []map[string]any{
					{
						"scope": map[string]any{"name": "@domio/observability-go"},
						"spans": otlpSpans,
					},
				},
			},
		},
	}
	return t.exporter.export(ctx, signalTraces, payload)
}

func (t *Tracer) shutdown(ctx context.Context) error {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil
	}
	t.closed = true
	t.mu.Unlock()
	// Exporter is closed once by Observability.Shutdown — see that doc.
	return t.Flush(ctx)
}

// DefaultBucketsMs is the default histogram bucket layout.
var DefaultBucketsMs = []float64{1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000}

type counterState struct {
	byAttrs   map[string]float64
	monotonic bool // true for Counter (default), false for UpDownCounter
}

type histogramState struct {
	bucketBounds []float64
	buckets      map[string][]float64 // by attribute key (sorted)
}

func metricAttrKey(attrs map[string]string) string {
	if len(attrs) == 0 {
		return ""
	}
	keys := make([]string, 0, len(attrs))
	for k := range attrs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(attrs[k])
	}
	return b.String()
}

// Countable is the interface returned by Counter / UpDownCounter / Histogram.
type Countable interface {
	Name() string
}

// Counter is a monotonic counter.
type Counter struct {
	name string
	mtr  *Meter
	desc string
	unit string
}

// Name returns the metric name.
func (c *Counter) Name() string { return c.name }

// Add adds `value` to the counter.
func (c *Counter) Add(value float64, attrs map[string]string) {
	c.mtr.addCounter(c.name, value, attrs, false)
}

// UpDownCounter is a non-monotonic counter.
type UpDownCounter struct {
	name string
	mtr  *Meter
	desc string
	unit string
}

// Name returns the metric name.
func (c *UpDownCounter) Name() string { return c.name }

// Add adds `value` to the gauge.
func (c *UpDownCounter) Add(value float64, attrs map[string]string) {
	c.mtr.addCounter(c.name, value, attrs, true)
}

// Histogram records value distributions.
type Histogram struct {
	name string
	mtr  *Meter
	desc string
	unit string
}

// Name returns the metric name.
func (h *Histogram) Name() string { return h.name }

// Record records a single value.
func (h *Histogram) Record(value float64, attrs map[string]string) {
	h.mtr.recordHistogram(h.name, value, attrs)
}

func (m *Meter) addCounter(name string, value float64, attrs map[string]string, allowNegative bool) {
	if !metricNameRE.MatchString(name) {
		panic("observe: invalid metric name " + name)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.counters == nil {
		m.counters = map[string]*counterState{}
	}
	state, ok := m.counters[name]
	if !ok {
		state = &counterState{
			byAttrs:   map[string]float64{},
			monotonic: !allowNegative,
		}
		m.counters[name] = state
	}
	k := metricAttrKey(attrs)
	state.byAttrs[k] += value
	_ = allowNegative // counter semantics enforced by caller; we accept both
}

func (m *Meter) recordHistogram(name string, value float64, attrs map[string]string) {
	if !metricNameRE.MatchString(name) {
		panic("observe: invalid metric name " + name)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.hists == nil {
		m.hists = map[string]*histogramState{}
	}
	state, ok := m.hists[name]
	if !ok {
		state = &histogramState{
			bucketBounds: DefaultBucketsMs,
			buckets:      map[string][]float64{},
		}
		m.hists[name] = state
	}
	k := metricAttrKey(attrs)
	bucket, ok := state.buckets[k]
	if !ok {
		bucket = make([]float64, len(state.bucketBounds))
		state.buckets[k] = bucket
	}
	for i, bound := range state.bucketBounds {
		if value <= bound {
			bucket[i]++
		}
	}
}

// CreateCounter makes or fetches a Counter by name.
func (m *Meter) CreateCounter(name string, opts ...MetricOptions) *Counter {
	if !metricNameRE.MatchString(name) {
		panic("observe: invalid metric name " + name)
	}
	c := &Counter{name: name, mtr: m}
	for _, o := range opts {
		c.desc = o.Description
		c.unit = o.Unit
	}
	return c
}

// CreateUpDownCounter makes or fetches an UpDownCounter by name.
func (m *Meter) CreateUpDownCounter(name string, opts ...MetricOptions) *UpDownCounter {
	if !metricNameRE.MatchString(name) {
		panic("observe: invalid metric name " + name)
	}
	u := &UpDownCounter{name: name, mtr: m}
	for _, o := range opts {
		u.desc = o.Description
		u.unit = o.Unit
	}
	return u
}

// CreateHistogram makes or fetches a Histogram by name.
func (m *Meter) CreateHistogram(name string, opts ...MetricOptions) *Histogram {
	if !metricNameRE.MatchString(name) {
		panic("observe: invalid metric name " + name)
	}
	h := &Histogram{name: name, mtr: m}
	for _, o := range opts {
		h.desc = o.Description
		h.unit = o.Unit
	}
	return h
}

// MetricOptions are optional metric creation options.
type MetricOptions struct {
	Description string
	Unit        string
}

// Flush ships every accumulated metric to the OTLP endpoint.
func (m *Meter) Flush(ctx context.Context) error {
	m.mu.Lock()
	if m.exporter == nil {
		m.mu.Unlock()
		return nil
	}
	counters := m.counters
	hists := m.hists
	// Reset state — counters and histograms are delta-temporality here.
	m.counters = map[string]*counterState{}
	m.hists = map[string]*histogramState{}
	m.mu.Unlock()

	type dp struct {
		name      string
		sum       *float64
		count     *float64
		attrs     map[string]string
		monotonic bool
		isHist    bool
		bucketBnds []float64
		bucketCounts []float64
	}
	var points []dp

	for name, st := range counters {
		for k, v := range st.byAttrs {
			val := v
			points = append(points, dp{
				name:      name,
				sum:       &val,
				attrs:     parseAttrKey(k),
				monotonic: st.monotonic,
			})
		}
	}
	for name, st := range hists {
		for k, bucket := range st.buckets {
			// Compute count/sum approximation: this SDK doesn't keep
			// running sum/count per histogram bucket, so we approximate
			// sum via the bucket means + count = bucket[last] - bucket[last-1]
			// for overflow. To keep semantics simple we only emit counts.
			counts := make([]float64, len(bucket)+1)
			copy(counts, bucket)
			// overflow = total count - last finite bucket
			total := 0.0
			for _, b := range bucket {
				total += b
			}
			counts[len(counts)-1] = total
			points = append(points, dp{
				name:        name,
				isHist:      true,
				attrs:       parseAttrKey(k),
				bucketBnds:  st.bucketBounds,
				bucketCounts: counts,
			})
		}
	}

	if len(points) == 0 {
		return nil
	}

	type otlpMetric struct {
		Name                  string             `json:"name"`
		Description           string             `json:"description,omitempty"`
		Unit                  string             `json:"unit,omitempty"`
		Sum                   *float64           `json:"sum,omitempty"`
		Count                 *float64           `json:"count,omitempty"`
		AggregationTemporality int                `json:"aggregationTemporality"`
		IsMonotonic           bool               `json:"isMonotonic"`
		Attributes            []OtlpPair         `json:"attributes"`
		BucketBounds          []float64          `json:"bucketBounds,omitempty"`
		BucketCounts          []float64          `json:"bucketCounts,omitempty"`
	}
	metrics := make([]otlpMetric, 0, len(points))
	for _, p := range points {
		m := otlpMetric{
			Name:                   p.name,
			AggregationTemporality: 2,
			IsMonotonic:            p.monotonic && !p.isHist,
			Attributes:             toOtlpAttrsAny(p.attrs),
		}
		if !p.isHist && p.sum != nil {
			m.Sum = p.sum
		}
		if p.isHist {
			m.IsMonotonic = true
			m.Count = floatPtr(0)
			if len(p.bucketCounts) > 0 {
				m.Count = floatPtr(p.bucketCounts[len(p.bucketCounts)-1])
			}
			m.BucketBounds = p.bucketBnds
			m.BucketCounts = p.bucketCounts
		}
		metrics = append(metrics, m)
	}
	payload := map[string]any{
		"resourceMetrics": []map[string]any{
			{
				"resource": m.resource.toOtlp(),
				"scopeMetrics": []map[string]any{
					{
						"scope":   map[string]any{"name": "@domio/observability-go"},
						"metrics": metrics,
					},
				},
			},
		},
	}
	return m.exporter.export(ctx, signalMetrics, payload)
}

func floatPtr(v float64) *float64 { return &v }

func (m *Meter) shutdown(ctx context.Context) error {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil
	}
	m.closed = true
	m.mu.Unlock()
	// Exporter is closed once by Observability.Shutdown — see that doc.
	return m.Flush(ctx)
}

// Severity is the OTLP log severity.
type Severity string

const (
	SeverityTrace Severity = "TRACE"
	SeverityDebug Severity = "DEBUG"
	SeverityInfo  Severity = "INFO"
	SeverityWarn  Severity = "WARN"
	SeverityError Severity = "ERROR"
	SeverityFatal Severity = "FATAL"
)

var severityToOtlp = map[Severity]int{
	SeverityTrace: 1,
	SeverityDebug: 5,
	SeverityInfo:  9,
	SeverityWarn:  13,
	SeverityError: 17,
	SeverityFatal: 21,
}

// LogRecord is the in-memory form of a log line.
type LogRecord struct {
	Severity    Severity
	Body        string
	Attributes  map[string]string
	TimestampMs int64
	TraceID     string
	SpanID      string
}

type logRecord struct {
	severity    Severity
	body        string
	attributes  map[string]string
	timestampMs int64
	traceID     string
	spanID      string
}

// Log queues a log record onto the logger. The record is sent on Flush
// or Shutdown.
func (l *Logger) Log(r LogRecord) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if r.TimestampMs == 0 {
		r.TimestampMs = time.Now().UnixMilli()
	}
	if r.Attributes == nil {
		r.Attributes = map[string]string{}
	}
	l.queue = append(l.queue, logRecord{
		severity:    r.Severity,
		body:        r.Body,
		attributes:  r.Attributes,
		timestampMs: r.TimestampMs,
		traceID:     r.TraceID,
		spanID:      r.SpanID,
	})
}

// Flush ships every queued record to the OTLP endpoint.
func (l *Logger) Flush(ctx context.Context) error {
	l.mu.Lock()
	if l.exporter == nil {
		l.mu.Unlock()
		return nil
	}
	if len(l.queue) == 0 {
		l.mu.Unlock()
		return nil
	}
	batch := l.queue
	l.queue = nil
	l.mu.Unlock()

	type otlpRecord struct {
		TimeUnixNano        string  `json:"timeUnixNano"`
		ObservedTimeUnixNano string `json:"observedTimeUnixNano"`
		SeverityNumber      int     `json:"severityNumber"`
		SeverityText        string  `json:"severityText"`
		Body                map[string]any `json:"body"`
		Attributes          []OtlpPair     `json:"attributes"`
		TraceID             string          `json:"traceId"`
		SpanID              string          `json:"spanId"`
	}
	records := make([]otlpRecord, 0, len(batch))
	for _, r := range batch {
		attrs := toOtlpAttrsAny(r.attributes)
		records = append(records, otlpRecord{
			TimeUnixNano:         fmt.Sprintf("%d", r.timestampMs*1_000_000),
			ObservedTimeUnixNano: fmt.Sprintf("%d", time.Now().UnixNano()),
			SeverityNumber:       severityToOtlp[r.severity],
			SeverityText:         string(r.severity),
			Body:                 map[string]any{"stringValue": r.body},
			Attributes:           attrs,
			TraceID:              r.traceID,
			SpanID:               r.spanID,
		})
	}
	payload := map[string]any{
		"resourceLogs": []map[string]any{
			{
				"resource": l.resource.toOtlp(),
				"scopeLogs": []map[string]any{
					{
						"scope":      map[string]any{"name": "@domio/observability-go"},
						"logRecords": records,
					},
				},
			},
		},
	}
	return l.exporter.export(ctx, signalLogs, payload)
}

func (l *Logger) shutdown(ctx context.Context) error {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return nil
	}
	l.closed = true
	l.mu.Unlock()
	// Exporter is closed once by Observability.Shutdown — see that doc.
	return l.Flush(ctx)
}

// toOtlpAttrs converts a map of string->any into OTLP key/value pairs.
func toOtlpAttrs(m map[string]any) []OtlpPair {
	if len(m) == 0 {
		return []OtlpPair{}
	}
	out := make([]OtlpPair, 0, len(m))
	for k, v := range m {
		out = append(out, OtlpPair{Key: k, Value: scalarToOtlp(v)})
	}
	return out
}

func toOtlpAttrsAny(m map[string]string) []OtlpPair {
	if len(m) == 0 {
		return []OtlpPair{}
	}
	out := make([]OtlpPair, 0, len(m))
	for k, v := range m {
		out = append(out, OtlpPair{Key: k, Value: map[string]any{"stringValue": v}})
	}
	return out
}

func scalarToOtlp(v any) map[string]any {
	switch t := v.(type) {
	case string:
		return map[string]any{"stringValue": t}
	case bool:
		return map[string]any{"boolValue": t}
	case int:
		return map[string]any{"intValue": fmt.Sprintf("%d", t)}
	case int32:
		return map[string]any{"intValue": fmt.Sprintf("%d", t)}
	case int64:
		return map[string]any{"intValue": fmt.Sprintf("%d", t)}
	case float32:
		return map[string]any{"doubleValue": float64(t)}
	case float64:
		return map[string]any{"doubleValue": t}
	default:
		return map[string]any{"stringValue": fmt.Sprintf("%v", t)}
	}
}

func kindToOtlp(kind string) int {
	switch kind {
	case "internal":
		return 1
	case "server":
		return 2
	case "client":
		return 3
	case "producer":
		return 4
	case "consumer":
		return 5
	}
	return 0
}

func statusToOtlp(s spanStatus) map[string]any {
	code := 0
	switch s.Code {
	case "ok":
		code = 1
	case "error":
		code = 2
	}
	return map[string]any{
		"code":    code,
		"message": s.Message,
	}
}

func parseAttrKey(k string) map[string]string {
	out := map[string]string{}
	if k == "" {
		return out
	}
	for _, pair := range strings.Split(k, ",") {
		idx := strings.IndexByte(pair, '=')
		if idx <= 0 {
			continue
		}
		out[pair[:idx]] = pair[idx+1:]
	}
	return out
}

// randomHex returns n random hex characters (lowercase).
func randomHex(n int) string {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand should never fail on linux; fall back to time-based
		// pseudo-random so the test doesn't deadlock on weird platforms.
		now := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(now >> (i % 8 * 8))
		}
	}
	h := hex.EncodeToString(b)
	if len(h) > n {
		h = h[:n]
	}
	return h
}
