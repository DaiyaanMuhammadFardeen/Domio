"""
Top-level entry point for the Domio observability SDK.

Mirrors ``@domio/observability/src/index.ts``. Behavior:

* Reads ``OTEL_EXPORTER_OTLP_ENDPOINT`` from env.
* If unset / empty / ``"none"`` / ``"noop"`` / ``"disabled"`` /
  ``"off"`` / ``"false"``: returns a no-op SDK. ``flush()`` resolves
  to nothing.
* Otherwise: initializes an OTLP/HTTP exporter and wires trace,
  metric, and log pipelines through it.
* Resource attributes are attached to every payload.
* PII in attributes / bodies is scrubbed before emission.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from domio_obs.internal.exporter import OtlpHttpExporter
from domio_obs.internal.logs import Logger, LogRecord, Severity
from domio_obs.internal.metrics import (
    Counter,
    Histogram,
    Meter,
    MetricOptions,
    UpDownCounter,
)
from domio_obs.internal.resource import (
    EndpointError,
    ResourceAttributes,
    ResourceError,
    build_resource,
    parse_otlp_endpoint,
)
from domio_obs.internal.trace import Span, SpanOptions, Tracer

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


NOOP_TOKENS = {"", "none", "noop", "disabled", "off", "false"}


class Observability:
    def __init__(
        self,
        mode: str,
        resource: ResourceAttributes,
        tracer: Tracer,
        meter: Meter,
        logger: Logger,
    ) -> None:
        self.mode = mode
        self.resource = resource
        self.tracer = tracer
        self.meter = meter
        self.logger = logger
        self._shutdown_once = False

    def is_exporting(self) -> bool:
        return self.mode == "otlp"

    def shutdown(self) -> None:
        if self._shutdown_once:
            return
        self._shutdown_once = True
        self.tracer.shutdown()
        self.meter.shutdown()
        self.logger.shutdown()


def _read_endpoint_env(env: Dict[str, str]) -> Optional[str]:
    raw = env.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if raw is None:
        return None
    v = raw.strip().lower()
    if v in NOOP_TOKENS:
        return None
    return raw


def _read_transport_env_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {}
    token = os.environ.get("OTEL_EXPORTER_OTLP_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    extra = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS")
    if extra:
        for line in extra.split(","):
            if "=" not in line:
                continue
            k, _, v = line.partition("=")
            headers[k.strip()] = v.strip()
    return headers


def init(
    service_name: str,
    service_version: Optional[str] = None,
    service_namespace: Optional[str] = None,
    environment: Optional[str] = None,
    git_sha: Optional[str] = None,
    host_name: Optional[str] = None,
    endpoint: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    paths: Optional[Dict[str, str]] = None,
    extra_attributes: Optional[Dict[str, str]] = None,
) -> Observability:
    """
    Initialize the observability SDK.

    Returns a no-op bundle when the endpoint env / argument matches a
    disabled token. Otherwise builds an OTLP/HTTP exporter and wires
    trace / metrics / logs to it.

    Raises ``ResourceError`` on invalid resource attributes, or
    ``EndpointError`` on a malformed endpoint URL.
    """
    resource = build_resource(
        service_name=service_name,
        service_version=service_version,
        service_namespace=service_namespace,
        environment=environment,
        git_sha=git_sha,
        host_name=host_name,
        extra=extra_attributes,
    )
    env_headers = _read_transport_env_headers()
    merged_headers = {**env_headers, **(headers or {})}

    resolved_endpoint = endpoint if endpoint is not None else _read_endpoint_env(os.environ)
    if resolved_endpoint is None:
        return _noop_bundle(resource)

    parse_otlp_endpoint(resolved_endpoint)
    exporter = OtlpHttpExporter(
        endpoint=resolved_endpoint,
        headers=merged_headers,
        paths=paths or {},
    )
    return _otlp_bundle(resource, exporter)


def _noop_bundle(resource: ResourceAttributes) -> Observability:
    return Observability(
        mode="noop",
        resource=resource,
        tracer=Tracer(resource, None),
        meter=Meter(resource, None),
        logger=Logger(resource, None),
    )


def _otlp_bundle(resource: ResourceAttributes, exporter: OtlpHttpExporter) -> Observability:
    return Observability(
        mode="otlp",
        resource=resource,
        tracer=Tracer(resource, exporter),
        meter=Meter(resource, exporter),
        logger=Logger(resource, exporter),
    )


def is_noop(o: Observability) -> bool:
    return o.mode == "noop"
