"""Pytest fixtures: capture-mode OTLP receiver."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import pytest

from domio_obs.internal.exporter import OtlpHttpExporter, OtlpRequest, OtlpResponse


@dataclass
class RecordedRequest:
    method: str
    path: str
    url: str
    body: bytes
    headers: Dict[str, str]


class RecordingTransport:
    """In-process OTLP receiver used by the test suite."""

    def __init__(self) -> None:
        self._requests: List[RecordedRequest] = []
        self._lock = threading.Lock()

    def __call__(self, req: OtlpRequest) -> OtlpResponse:
        u = urlparse(req.url)
        with self._lock:
            self._requests.append(
                RecordedRequest(
                    method=req.method,
                    path=u.path,
                    url=req.url,
                    body=req.body,
                    headers=dict(req.headers),
                )
            )
        return OtlpResponse(status=200, status_text="OK", body="{}")

    def all(self) -> List[RecordedRequest]:
        with self._lock:
            return list(self._requests)


@pytest.fixture
def recorder() -> RecordingTransport:
    return RecordingTransport()


@pytest.fixture
def make_exporter(recorder: RecordingTransport) -> Callable[[Optional[str]], OtlpHttpExporter]:
    def _make(endpoint: Optional[str] = "http://collector:4318") -> OtlpHttpExporter:
        exp = OtlpHttpExporter(endpoint=endpoint or "http://collector:4318")
        exp.transport = recorder
        return exp

    return _make