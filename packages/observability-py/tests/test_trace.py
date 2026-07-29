"""Tests for the trace API."""

from __future__ import annotations

import json
from typing import Any

import pytest

from domio_obs.internal.resource import build_resource
from domio_obs.internal.trace import SpanOptions, Tracer, TracerError


def _resource() -> Any:
    return build_resource(
        service_name="test-service",
        service_version="0.0.0",
        environment="test",
        git_sha="0000007",
    )


def test_start_span_returns_valid_ids() -> None:
    t = Tracer(_resource(), None)
    s = t.start_span("GET /decks")
    assert len(s.trace_id) == 32
    assert len(s.span_id) == 16
    assert s.name == "GET /decks"


def test_flush_with_no_exporter_is_noop() -> None:
    t = Tracer(_resource(), None)
    s = t.start_span("op")
    s.end()
    t.flush()  # should not raise


def test_emits_span_to_exporter(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    s = t.start_span("GET /decks", SpanOptions(attributes={"http.method": "GET"}))
    s.set_attribute("http.status_code", 200)
    s.end()
    t.flush()
    reqs = recorder.all()
    assert len(reqs) == 1
    assert reqs[0].path == "/v1/traces"
    body = json.loads(reqs[0].body.decode("utf-8"))
    rs = body["resourceSpans"][0]
    attrs = {a["key"]: a["value"]["stringValue"] for a in rs["resource"]["attributes"]}
    assert attrs["service.name"] == "test-service"
    assert attrs["deployment.environment"] == "test"
    assert attrs["git.sha"] == "0000007"
    spans = rs["scopeSpans"][0]["spans"]
    assert len(spans) == 1
    assert spans[0]["name"] == "GET /decks"
    assert len(spans[0]["traceId"]) == 32
    assert len(spans[0]["spanId"]) == 16


def test_end_is_idempotent(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    s = t.start_span("op")
    s.end()
    s.end()
    s.end()
    t.flush()
    assert len(recorder.all()) == 1


def test_parent_span_id_included(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    parent = t.start_span("parent")
    parent.end()
    child = t.start_span(
        "child",
        SpanOptions(parent_trace_id=parent.trace_id, parent_span_id=parent.span_id),
    )
    child.end()
    t.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    spans = body["resourceSpans"][0]["scopeSpans"][0]["spans"]
    child_obj = next(s for s in spans if s["name"] == "child")
    assert child_obj["parentSpanId"] == parent.span_id
    assert child_obj["traceId"] == parent.trace_id


def test_record_exception_sets_status_error(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    s = t.start_span("op")
    try:
        raise ValueError("boom")
    except ValueError as e:
        s.record_exception(e)
    s.end()
    t.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    span_obj = body["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    assert span_obj["status"]["code"] == 2
    assert len(span_obj["events"]) == 1
    assert span_obj["events"][0]["name"] == "exception"


def test_set_status(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    s = t.start_span("op")
    s.set_status("error", "something bad")
    s.end()
    t.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    span_obj = body["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    assert span_obj["status"]["code"] == 2
    assert span_obj["status"]["message"] == "something bad"


def test_invalid_parent_span_id_raises() -> None:
    t = Tracer(_resource(), None)
    with pytest.raises(TracerError):
        t.start_span("child", SpanOptions(parent_trace_id="a" * 32, parent_span_id="bad"))


def test_pii_redaction_applied_to_attributes(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    t = Tracer(_resource(), exp)
    s = t.start_span("op", SpanOptions(attributes={"user_email": "alice@example.com"}))
    s.end()
    t.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    attrs = body["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
    email_attr = next(a for a in attrs if a["key"] == "user_email")
    assert email_attr["value"]["stringValue"] == "[REDACTED]"
