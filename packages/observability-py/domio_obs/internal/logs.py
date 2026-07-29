"""
Logs API — minimal OTLP-flavored logger.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from domio_obs.internal.exporter import OtlpHttpExporter
from domio_obs.internal.redaction import redact_string, redact_value
from domio_obs.internal.resource import ResourceAttributes


class Severity(str, Enum):
    TRACE = "TRACE"
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    FATAL = "FATAL"


SEVERITY_TO_OTLP: Dict[Severity, int] = {
    Severity.TRACE: 1,
    Severity.DEBUG: 5,
    Severity.INFO: 9,
    Severity.WARN: 13,
    Severity.ERROR: 17,
    Severity.FATAL: 21,
}


@dataclass
class LogRecord:
    severity: Severity = Severity.INFO
    body: str = ""
    attributes: Optional[Dict[str, Any]] = None
    timestamp_ms: Optional[int] = None
    trace_id: str = ""
    span_id: str = ""


class Logger:
    def __init__(
        self,
        resource: ResourceAttributes,
        exporter: Optional[OtlpHttpExporter],
        default_attributes: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.resource = resource
        self.exporter = exporter
        self._defaults = dict(default_attributes or {})
        self._queue: List[LogRecord] = []
        self._flushing = False

    def log(self, record: LogRecord) -> None:
        if record.timestamp_ms is None:
            record.timestamp_ms = int(time.time() * 1000)
        record.body = redact_string(record.body)
        if record.attributes:
            record.attributes = redact_value(record.attributes)
        self._queue.append(record)

    def child(self, attributes: Dict[str, Any]) -> "Logger":
        merged = {**self._defaults, **(attributes or {})}
        return Logger(self.resource, self.exporter, merged)

    def flush(self) -> None:
        if self.exporter is None:
            return
        if self._flushing:
            return
        self._flushing = True
        try:
            if not self._queue:
                return
            batch = self._queue
            self._queue = []
            records: List[Dict[str, Any]] = []
            now_ns = int(time.time() * 1_000_000_000)
            for r in batch:
                merged = {**self._defaults, **(r.attributes or {})}
                records.append(
                    {
                        "timeUnixNano": str((r.timestamp_ms or int(time.time() * 1000)) * 1_000_000),
                        "observedTimeUnixNano": str(now_ns),
                        "severityNumber": SEVERITY_TO_OTLP[r.severity],
                        "severityText": r.severity.value,
                        "body": {"stringValue": r.body},
                        "attributes": _attrs_to_otlp(merged),
                        "traceId": r.trace_id,
                        "spanId": r.span_id,
                    }
                )
            payload = {
                "resourceLogs": [
                    {
                        "resource": self.resource.to_otlp(),
                        "scopeLogs": [
                            {
                                "scope": {"name": "@domio/observability-py"},
                                "logRecords": records,
                            }
                        ],
                    }
                ]
            }
            self.exporter.export_json("logs", payload)
        finally:
            self._flushing = False

    def shutdown(self) -> None:
        self.flush()
        if self.exporter is not None:
            self.exporter.shutdown()


def _attrs_to_otlp(attrs: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for k, v in attrs.items():
        if isinstance(v, bool):
            out.append({"key": k, "value": {"boolValue": v}})
        elif isinstance(v, int):
            out.append({"key": k, "value": {"intValue": str(v)}})
        elif isinstance(v, float):
            out.append({"key": k, "value": {"doubleValue": v}})
        else:
            out.append({"key": k, "value": {"stringValue": str(v)}})
    return out