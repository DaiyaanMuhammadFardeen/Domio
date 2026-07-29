"""
domio_obs — Domio observability SDK for Python.

Public surface mirrors the TypeScript and Go packages:

    from domio_obs import init, Severity

    obs = init(service_name="api-client", environment="dev", git_sha="abc1234")
    span = obs.tracer.start_span("GET /decks")
    span.set_attribute("http.status_code", 200)
    span.end()
    obs.tracer.flush()
    obs.shutdown()

The SDK is a strict no-op when ``OTEL_EXPORTER_OTLP_ENDPOINT`` is unset
/ empty / "none" / "disabled" / "off" / "false" (case-insensitive).

Resource attributes attached to every payload (Phase 01 §5.B.3):
    - service.name
    - service.version
    - deployment.environment
    - git.sha

PII redaction is applied before emission. The regex patterns mirror
@domio/redact-pii.
"""

from domio_obs.observability import (
    Observability,
    Severity,
    Span,
    Counter,
    UpDownCounter,
    Histogram,
    LogRecord,
    MetricOptions,
    SpanOptions,
    ResourceAttributes,
    ResourceError,
    EndpointError,
    OtlpHttpExporter,
    init,
    is_noop,
)

__all__ = [
    "Observability",
    "Severity",
    "Span",
    "Counter",
    "UpDownCounter",
    "Histogram",
    "LogRecord",
    "MetricOptions",
    "SpanOptions",
    "ResourceAttributes",
    "ResourceError",
    "EndpointError",
    "OtlpHttpExporter",
    "init",
    "is_noop",
]

__version__ = "0.1.0"
