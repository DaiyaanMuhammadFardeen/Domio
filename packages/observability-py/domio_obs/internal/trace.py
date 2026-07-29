"""
Trace API — minimal OTLP-flavored span model.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from domio_obs.internal.exporter import OtlpHttpExporter
from domio_obs.internal.redaction import redact_value
from domio_obs.internal.resource import ResourceAttributes


TRACE_ID_LEN = 32
SPAN_ID_LEN = 16

KIND_TO_OTLP = {
    "internal": 1,
    "server": 2,
    "client": 3,
    "producer": 4,
    "consumer": 5,
}

STATUS_TO_OTLP = {
    "unset": 0,
    "ok": 1,
    "error": 2,
}


class TracerError(ValueError):
    """Raised when span construction fails validation."""


def _random_hex(n: int) -> str:
    return secrets.token_hex(n // 2)


@dataclass
class SpanOptions:
    name: str = ""
    attributes: Dict[str, Any] = field(default_factory=dict)
    parent_trace_id: Optional[str] = None
    parent_span_id: Optional[str] = None
    kind: str = "internal"
    start_ms: Optional[int] = None


@dataclass
class Span:
    name: str
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    kind: str
    start_ms: int
    end_ms: Optional[int] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)
    status_code: str = "unset"
    status_message: str = ""
    _ended: bool = False

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def record_exception(self, err: BaseException) -> None:
        msg = f"{type(err).__name__}: {err}"[:256]
        self.events.append(
            {
                "timeUnixNano": str(int(time.time() * 1_000_000_000)),
                "name": "exception",
                "attributes": {"exception.message": msg},
            }
        )
        self.status_code = "error"
        self.status_message = msg

    def set_status(self, code: str, message: str = "") -> None:
        if code not in STATUS_TO_OTLP:
            raise ValueError(f"invalid status code: {code}")
        self.status_code = code
        self.status_message = message

    def end(self, end_ms: Optional[int] = None) -> None:
        if self._ended:
            return
        self._ended = True
        self.end_ms = end_ms if end_ms is not None else int(time.time() * 1000)


class Tracer:
    def __init__(self, resource: ResourceAttributes, exporter: Optional[OtlpHttpExporter]) -> None:
        self.resource = resource
        self.exporter = exporter
        self._buffer: List[Span] = []
        self._flushing = False

    def start_span(self, name: str, options: Optional[SpanOptions] = None) -> Span:
        opts = options or SpanOptions(name=name)
        if opts.name == "" and name:
            opts.name = name
        trace_id = opts.parent_trace_id or _random_hex(TRACE_ID_LEN)
        span_id = _random_hex(SPAN_ID_LEN)
        start_ms = opts.start_ms if opts.start_ms is not None else int(time.time() * 1000)
        if len(trace_id) != TRACE_ID_LEN:
            raise TracerError(f"invalid traceId length: {trace_id!r}")
        if len(span_id) != SPAN_ID_LEN:
            raise TracerError(f"invalid spanId length: {span_id!r}")
        if opts.parent_span_id is not None and len(opts.parent_span_id) != SPAN_ID_LEN:
            raise TracerError(f"invalid parent spanId: {opts.parent_span_id!r}")
        span = Span(
            name=opts.name,
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=opts.parent_span_id,
            kind=opts.kind,
            start_ms=start_ms,
            attributes=dict(opts.attributes),
        )
        self._buffer.append(span)
        return span

    def flush(self) -> None:
        if self.exporter is None:
            return
        if self._flushing:
            return
        if not self._buffer:
            return
        self._flushing = True
        try:
            spans = self._buffer
            self._buffer = []
            otlp_spans: List[Dict[str, Any]] = []
            for s in spans:
                span_obj: Dict[str, Any] = {
                    "traceId": s.trace_id,
                    "spanId": s.span_id,
                    "name": s.name,
                    "kind": KIND_TO_OTLP.get(s.kind, 0),
                    "startTimeUnixNano": str(s.start_ms * 1_000_000),
                    "endTimeUnixNano": str((s.end_ms if s.end_ms is not None else s.start_ms) * 1_000_000),
                    "attributes": _attrs_to_otlp(redact_value(s.attributes)),
                    "events": [
                        {
                            "timeUnixNano": e["timeUnixNano"],
                            "name": e["name"],
                            "attributes": _attrs_to_otlp(redact_value(e["attributes"])),
                        }
                        for e in s.events
                    ],
                    "status": {
                        "code": STATUS_TO_OTLP.get(s.status_code, 0),
                        "message": s.status_message,
                    },
                }
                if s.parent_span_id:
                    span_obj["parentSpanId"] = s.parent_span_id
                otlp_spans.append(span_obj)
            payload = {
                "resourceSpans": [
                    {
                        "resource": self.resource.to_otlp(),
                        "scopeSpans": [
                            {"scope": {"name": "@domio/observability-py"}, "spans": otlp_spans},
                        ],
                    }
                ]
            }
            self.exporter.export_json("traces", payload)
        finally:
            self._flushing = False

    def shutdown(self) -> None:
        self.flush()
        if self.exporter is not None:
            self.exporter.shutdown()


def _attrs_to_otlp(attrs: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [_scalar_to_otlp(k, v) for k, v in attrs.items()]


def _scalar_to_otlp(key: str, value: Any) -> Dict[str, Any]:
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"doubleValue": value}}
    return {"key": key, "value": {"stringValue": str(value)}}
