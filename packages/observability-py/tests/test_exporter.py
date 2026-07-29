"""Tests for the OTLP/HTTP exporter."""

from __future__ import annotations

import json
from typing import Any

import pytest

from domio_obs.internal.exporter import OtlpHttpExporter


def test_initializes_with_endpoint() -> None:
    e = OtlpHttpExporter(endpoint="http://localhost:4318")
    assert e.endpoint == "http://localhost:4318"
    assert e.url_for("traces") == "http://localhost:4318/v1/traces"
    assert e.url_for("metrics") == "http://localhost:4318/v1/metrics"
    assert e.url_for("logs") == "http://localhost:4318/v1/logs"


def test_strips_trailing_slash() -> None:
    e = OtlpHttpExporter(endpoint="http://collector/")
    assert e.endpoint == "http://collector"


def test_custom_paths() -> None:
    e = OtlpHttpExporter(endpoint="http://collector", paths={"traces": "/ingest/traces"})
    assert e.url_for("traces") == "http://collector/ingest/traces"
    assert e.url_for("metrics") == "http://collector/v1/metrics"


def test_https_supported() -> None:
    e = OtlpHttpExporter(endpoint="https://collector.example.com")
    assert e.endpoint == "https://collector.example.com"


def test_export_uses_transport(recorder: Any) -> None:
    e = OtlpHttpExporter(endpoint="http://collector:4318")
    e.transport = recorder
    e.export_json("traces", {"foo": "bar"})
    reqs = recorder.all()
    assert len(reqs) == 1
    assert reqs[0].method == "POST"
    assert reqs[0].path == "/v1/traces"
    assert reqs[0].url == "http://collector:4318/v1/traces"
    assert reqs[0].headers["Content-Type"] == "application/json"
    body = json.loads(reqs[0].body.decode("utf-8"))
    assert body == {"foo": "bar"}


def test_custom_headers_attached(recorder: Any) -> None:
    e = OtlpHttpExporter(
        endpoint="http://collector",
        headers={"Authorization": "Bearer xyz", "x-tenant": "org_1"},
    )
    e.transport = recorder
    e.export_json("logs", {"hi": 1})
    headers = recorder.all()[0].headers
    assert headers["Authorization"] == "Bearer xyz"
    assert headers["x-tenant"] == "org_1"


def test_shutdown_idempotent() -> None:
    e = OtlpHttpExporter(endpoint="http://collector")
    e.shutdown()
    e.shutdown()
    e.shutdown()
    assert e.is_closed()


def test_rejects_export_after_shutdown() -> None:
    e = OtlpHttpExporter(endpoint="http://collector")
    e.shutdown()
    with pytest.raises(RuntimeError, match="closed"):
        e.export_json("traces", {})
