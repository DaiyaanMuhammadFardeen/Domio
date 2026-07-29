"""Tests for the metrics API."""

from __future__ import annotations

import json
from typing import Any

import pytest

from domio_obs.internal.metrics import DEFAULT_BUCKETS_MS, Meter
from domio_obs.internal.resource import build_resource


def _resource() -> Any:
    return build_resource(
        service_name="test-service",
        environment="test",
        git_sha="0000007",
    )


def test_counter_accumulates_and_flushes(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    m = Meter(_resource(), exp)
    c = m.create_counter("http_requests_total")
    c.add(1, {"method": "GET"})
    c.add(2, {"method": "POST"})
    m.flush()
    reqs = recorder.all()
    assert len(reqs) == 1
    body = json.loads(reqs[0].body.decode("utf-8"))
    metrics = body["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
    assert len(metrics) == 2


def test_up_down_counter_is_non_monotonic(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    m = Meter(_resource(), exp)
    c = m.create_up_down_counter("in_flight")
    c.add(5)
    c.add(-2)
    m.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    metric = body["resourceMetrics"][0]["scopeMetrics"][0]["metrics"][0]
    assert metric["isMonotonic"] is False


def test_histogram_records_bucket_counts(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    m = Meter(_resource(), exp)
    h = m.create_histogram("request_duration_ms")
    h.record(5)
    h.record(50)
    h.record(500)
    h.record(50_000)
    m.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    metric = body["resourceMetrics"][0]["scopeMetrics"][0]["metrics"][0]
    assert metric["name"] == "request_duration_ms"
    assert metric["bucketBounds"] == list(DEFAULT_BUCKETS_MS)
    assert len(metric["bucketCounts"]) == len(DEFAULT_BUCKETS_MS) + 1
    # Overflow bucket equals total count.
    assert metric["bucketCounts"][-1] == 4


def test_flush_no_data_is_noop(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    m = Meter(_resource(), exp)
    m.flush()
    assert len(recorder.all()) == 0


def test_flush_with_no_exporter_is_noop() -> None:
    m = Meter(_resource(), None)
    c = m.create_counter("foo")
    c.add(1)
    m.flush()


def test_invalid_metric_name_rejected() -> None:
    m = Meter(_resource(), None)
    with pytest.raises(ValueError):
        m.create_counter("has space")
    with pytest.raises(ValueError):
        m.create_counter("has#hash")
    with pytest.raises(ValueError):
        m.create_counter("")


def test_flush_resets_counter(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    m = Meter(_resource(), exp)
    c = m.create_counter("foo_total")
    c.add(5)
    m.flush()
    c.add(3)
    m.flush()
    body1 = json.loads(recorder.all()[0].body.decode("utf-8"))
    body2 = json.loads(recorder.all()[1].body.decode("utf-8"))
    assert body1["resourceMetrics"][0]["scopeMetrics"][0]["metrics"][0]["sum"] == 5
    assert body2["resourceMetrics"][0]["scopeMetrics"][0]["metrics"][0]["sum"] == 3
