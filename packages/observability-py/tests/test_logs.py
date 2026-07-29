"""Tests for the logs API."""

from __future__ import annotations

import json
from typing import Any

from domio_obs.internal.logs import Logger, LogRecord, Severity
from domio_obs.internal.resource import build_resource


def _resource() -> Any:
    return build_resource(
        service_name="test-service",
        environment="test",
        git_sha="0000007",
    )


def test_emits_log_records(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    l = Logger(_resource(), exp)
    l.log(LogRecord(severity=Severity.INFO, body="hello"))
    l.log(LogRecord(severity=Severity.ERROR, body="oops", attributes={"req_id": "r1"}))
    l.flush()
    reqs = recorder.all()
    assert len(reqs) == 1
    body = json.loads(reqs[0].body.decode("utf-8"))
    records = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"]
    assert len(records) == 2
    assert records[0]["severityText"] == "INFO"
    assert records[0]["severityNumber"] == 9
    assert records[1]["severityNumber"] == 17


def test_pii_redacted_in_log_body(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    l = Logger(_resource(), exp)
    l.log(LogRecord(severity=Severity.INFO, body="contact alice@example.com"))
    l.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    record = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]
    assert "alice@example.com" not in record["body"]["stringValue"]
    assert "[REDACTED]" in record["body"]["stringValue"]


def test_pii_redacted_in_attributes(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    l = Logger(_resource(), exp)
    l.log(
        LogRecord(
            severity=Severity.INFO,
            body="login",
            attributes={"user_email": "a@b.com", "tenant_id": "org_1"},
        )
    )
    l.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    attrs = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]["attributes"]
    attr_map = {a["key"]: a["value"]["stringValue"] for a in attrs}
    assert attr_map["user_email"] == "[REDACTED]"
    assert attr_map["tenant_id"] == "org_1"


def test_default_attributes_merged(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    l = Logger(_resource(), exp, default_attributes={"app": "web"})
    l.log(LogRecord(severity=Severity.DEBUG, body="x"))
    l.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    attrs = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]["attributes"]
    attr_map = {a["key"]: a["value"]["stringValue"] for a in attrs}
    assert attr_map["app"] == "web"


def test_child_logger_inherits(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    parent = Logger(_resource(), exp, default_attributes={"app": "web"})
    child = parent.child({"component": "editor"})
    child.log(LogRecord(severity=Severity.INFO, body="paint"))
    child.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    attrs = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]["attributes"]
    attr_map = {a["key"]: a["value"]["stringValue"] for a in attrs}
    assert attr_map["app"] == "web"
    assert attr_map["component"] == "editor"


def test_all_severities(recorder: Any) -> None:
    from domio_obs.internal.exporter import OtlpHttpExporter

    exp = OtlpHttpExporter(endpoint="http://collector:4318")
    exp.transport = recorder
    l = Logger(_resource(), exp)
    for s in [Severity.TRACE, Severity.DEBUG, Severity.INFO, Severity.WARN, Severity.ERROR, Severity.FATAL]:
        l.log(LogRecord(severity=s, body=str(s)))
    l.flush()
    body = json.loads(recorder.all()[0].body.decode("utf-8"))
    records = body["resourceLogs"][0]["scopeLogs"][0]["logRecords"]
    assert [r["severityNumber"] for r in records] == [1, 5, 9, 13, 17, 21]


def test_no_exporter_flush_is_noop() -> None:
    l = Logger(_resource(), None)
    l.log(LogRecord(severity=Severity.INFO, body="hi"))
    l.flush()


def test_shutdown_idempotent() -> None:
    l = Logger(_resource(), None)
    l.shutdown()
    l.shutdown()
    l.shutdown()
