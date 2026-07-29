"""
Minimal OTLP/HTTP exporter for the Python observability SDK.

Zero-dependency (stdlib only). Uses ``urllib.request`` under the hood.
For tests, callers can inject a custom ``transport`` callable.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


@dataclass
class OtlpHttpExporter:
    endpoint: str
    headers: Dict[str, str] = field(default_factory=dict)
    paths: Dict[str, str] = field(default_factory=dict)
    timeout_s: float = 5.0
    transport: Optional[Callable[["OtlpRequest"], "OtlpResponse"]] = None
    _closed: bool = False

    def __post_init__(self) -> None:
        self.endpoint = self.endpoint.rstrip("/")
        if not self.paths:
            self.paths = {
                "traces": "/v1/traces",
                "metrics": "/v1/metrics",
                "logs": "/v1/logs",
            }

    def url_for(self, signal: str) -> str:
        return f"{self.endpoint}{self.paths.get(signal, f'/v1/{signal}')}"

    def is_closed(self) -> bool:
        return self._closed

    def export_json(self, signal: str, payload: Any) -> "OtlpResponse":
        if self._closed:
            raise RuntimeError("exporter is closed")
        body = json.dumps(payload).encode("utf-8")
        request = OtlpRequest(
            url=self.url_for(signal),
            method="POST",
            headers={"Content-Type": "application/json", **self.headers},
            body=body,
        )
        if self.transport is not None:
            return self.transport(request)
        return _default_transport(request, self.timeout_s)

    def shutdown(self) -> None:
        self._closed = True


@dataclass
class OtlpRequest:
    url: str
    method: str
    headers: Dict[str, str]
    body: bytes


@dataclass
class OtlpResponse:
    status: int
    status_text: str
    body: str


def _default_transport(req: OtlpRequest, timeout_s: float) -> OtlpResponse:
    r = urllib.request.Request(req.url, data=req.body, method=req.method, headers=req.headers)
    try:
        with urllib.request.urlopen(r, timeout=timeout_s) as resp:  # noqa: S310 (URL is configured by caller)
            return OtlpResponse(
                status=resp.status,
                status_text=resp.reason or "",
                body=resp.read().decode("utf-8", errors="replace"),
            )
    except urllib.error.HTTPError as e:
        return OtlpResponse(
            status=e.code,
            status_text=e.reason or "",
            body=e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else "",
        )
