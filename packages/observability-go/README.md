# @domio/observability-go

Domio observability SDK for Go services. Zero-dependency (stdlib only),
hand-rolled OTLP/HTTP exporter covering the same surface as the
TypeScript package: trace, metric, log APIs, resource attributes
(`service.name`, `service.version`, `deployment.environment`, `git.sha`),
PII redaction hooks, and a strict no-op fallback when
`OTEL_EXPORTER_OTLP_ENDPOINT` is unset / empty / `"none"` / `"disabled"`.

## Usage

```go
import obs "github.com/domio/platform/observability-go"

o, err := obs.New(obs.InitOptions{
    Resource: obs.ResourceOptions{
        ServiceName: "realtime-gateway",
        GitSHA:      os.Getenv("GIT_SHA"),
    },
    // Endpoint defaults to $OTEL_EXPORTER_OTLP_ENDPOINT.
})
if err != nil { log.Fatal(err) }
defer o.Shutdown(context.Background())

// Trace
s := o.Tracer.StartSpan("GET /decks")
s.SetAttribute("http.status_code", 200)
s.End()
_ = o.Tracer.Flush(ctx)

// Metrics
c := o.Meter.CreateCounter("requests_total", obs.MetricOptions{Unit: "1"})
c.Add(1, map[string]string{"method": "GET"})
_ = o.Meter.Flush(ctx)

// Logs
o.Logger.Log(obs.LogRecord{Severity: obs.SeverityInfo, Body: "started"})
_ = o.Logger.Flush(ctx)
```

## Test

The Go toolchain is not available in this worktree at the time of
authoring. To run the tests locally:

```sh
cd packages/observability-go
go test ./...
```

## Notes

- The wire format is OTLP/HTTP JSON. No gRPC support yet — out of scope
  for Phase 01 §5.B.3 which specifies OTLP/HTTP.
- PII redaction is the same regex set as `@domio/redact-pii` but inlined
  for zero-dependency. The regex set is small; production services that
  need full coverage should use the TS package or extend these patterns.
- Resource validation is strict: `service.name` must match
  `^[a-zA-Z][a-zA-Z0-9_.-]*$`, `git.sha` must be a 7..64 char hex
  string (or `"unknown"`).