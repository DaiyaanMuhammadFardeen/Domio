"""Tests for init() — covers the no-op mode + otlp mode + integration."""

from __future__ import annotations

import json
import os
from typing import Any

import pytest

from domio_obs.observability import init, is_noop


def test_noop_when_endpoint_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    o = init(service_name="svc")
    assert o.mode == "noop"
    assert is_noop(o)
    assert o.is_exporting() is False


@pytest.mark.parametrize(
    "token", ["", "none", "noop", "off", "disabled", "false", "NOOP", "OFF"]
)
def test_noop_token_spellings(monkeypatch: pytest.MonkeyPatch, token: str) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", token)
    o = init(service_name="svc")
    assert o.mode == "noop"


def test_otlp_mode_with_explicit_endpoint(recorder: Any) -> None:
    o = init(service_name="svc", endpoint="http://collector:4318")
    # Inject recorder via the export bundle.
    o.tracer._buffer  # noqa: B018 (sanity check on attribute)
    # Replace the exporter transport.
    o.tracer.exporter.transport = recorder  # type: ignore[union-attr]
    o.meter.exporter.transport = recorder  # type: ignore[union-attr]
    o.logger.exporter.transport = recorder  # type: ignore[union-attr]
    assert o.mode == "otlp"
    assert o.is_exporting() is True


def test_emits_all_four_required_resource_attributes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    o = init(
        service_name="apps-web",
        service_version="1.2.3",
        environment="production",
        git_sha="abc1234",
    )
    assert o.resource.service_name == "apps-web"
    assert o.resource.service_version == "1.2.3"
    assert o.resource.deployment_environment == "production"
    assert o.resource.git_sha == "abc1234"


def test_explicit_endpoint_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://unused:9999")
    o = init(service_name="svc", endpoint="http://collector:4318")
    assert o.mode == "otlp"


def test_invalid_endpoint_raises() -> None:
    with pytest.raises(ValueError):
        init(service_name="svc", endpoint="not-a-url")


def test_invalid_service_name_raises() -> None:
    with pytest.raises(ValueError):
        init(service_name="")
    with pytest.raises(ValueError):
        init(service_name="has space")


def test_invalid_git_sha_raises() -> None:
    with pytest.raises(ValueError):
        init(service_name="svc", git_sha="abc")


def test_shutdown_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    o = init(service_name="svc", endpoint="http://collector:4318")
    o.shutdown()
    o.shutdown()
    o.shutdown()


def test_noop_flush_does_not_throw(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    o = init(service_name="svc")
    s = o.tracer.start_span("op")
    s.end()
    o.tracer.flush()
    o.meter.create_counter("c").add(1)
    o.meter.flush()
    o.logger.log(  # type: ignore[arg-type]
        type("R", (), {"severity": "INFO", "body": "hi", "attributes": None, "timestamp_ms": None, "trace_id": "", "span_id": ""})()
    )  # LogRecord has Severity enum; we keep the test minimal.


def test_integration_emits_to_mock_receiver(recorder: Any) -> None:
    o = init(
        service_name="integration-test",
        service_version="1.0.0",
        environment="test",
        git_sha="0c0ffee7",
        endpoint="http://collector:4318",
    )
    # Wire the same recorder to all three exporters.
    o.tracer.exporter.transport = recorder  # type: ignore[union-attr]
    o.meter.exporter.transport = recorder  # type: ignore[union-attr]
    o.logger.exporter.transport = recorder  # type: ignore[union-attr]

    s = o.tracer.start_span("GET /decks")
    s.set_attribute("http.status_code", 200)
    s.end()
    o.tracer.flush()

    c = o.meter.create_counter("http_requests_total")
    c.add(3, {"method": "GET"})
    c.add(1, {"method": "POST"})
    o.meter.flush()

    from domio_obs.internal.logs import LogRecord, Severity
    o.logger.log(LogRecord(severity=Severity.INFO, body="started"))
    o.logger.log(LogRecord(severity=Severity.ERROR, body="failed alice@example.com"))
    o.logger.flush()

    o.shutdown()

    reqs = recorder.all()
    by_path: dict[str, list[Any]] = {}
    for r in reqs:
        by_path.setdefault(r.path, []).append(r)

    assert "/v1/traces" in by_path
    assert "/v1/metrics" in by_path
    assert "/v1/logs" in by_path

    # Resource attributes on every payload.
    for r in reqs:
        body = json.loads(r.body.decode("utf-8"))
        resource = (
            body.get("resourceSpans", [{}])[0].get("resource")
            or body.get("resourceMetrics", [{}])[0].get("resource")
            or body.get("resourceLogs", [{}])[0].get("resource")
        )
        attrs = {a["key"]: a["value"]["stringValue"] for a in resource["attributes"]}
        assert attrs["service.name"] == "integration-test"
        assert attrs["service.version"] == "1.0.0"
        assert attrs["deployment.environment"] == "test"
        assert attrs["git.sha"] == "0c0ffee7"

    # PII in log body is redacted.
    logs_body = json.loads(by_path["/v1/logs"][0].body.decode("utf-8"))
    err_rec = next(
        r for r in logs_body["resourceLogs"][0]["scopeLogs"][0]["logRecords"]
        if r["severityText"] == "ERROR"
    )
    assert "alice@example.com" not in err_rec["body"]["stringValue"]
    assert "[REDACTED]" in err_rec["body"]["stringValue"]
