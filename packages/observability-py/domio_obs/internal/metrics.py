"""
Metrics API — minimal OTLP-flavored counters, histograms, and gauges.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from domio_obs.internal.exporter import OtlpHttpExporter
from domio_obs.internal.redaction import redact_value
from domio_obs.internal.resource import ResourceAttributes

SAFE_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.]*$")

DEFAULT_BUCKETS_MS: Tuple[float, ...] = (
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
)


@dataclass
class MetricOptions:
    description: str = ""
    unit: str = ""


class Counter:
    def __init__(self, name: str, meter: "Meter", options: Optional[MetricOptions] = None) -> None:
        self.name = name
        self._meter = meter
        self._opts = options or MetricOptions()

    def add(self, value: float, attributes: Optional[Dict[str, str]] = None) -> None:
        self._meter._add_counter(self.name, value, attributes, monotonic=True)


class UpDownCounter:
    def __init__(self, name: str, meter: "Meter", options: Optional[MetricOptions] = None) -> None:
        self.name = name
        self._meter = meter
        self._opts = options or MetricOptions()

    def add(self, value: float, attributes: Optional[Dict[str, str]] = None) -> None:
        self._meter._add_counter(self.name, value, attributes, monotonic=False)


class Histogram:
    def __init__(self, name: str, meter: "Meter", options: Optional[MetricOptions] = None) -> None:
        self.name = name
        self._meter = meter
        self._opts = options or MetricOptions()

    def record(self, value: float, attributes: Optional[Dict[str, str]] = None) -> None:
        self._meter._record_histogram(self.name, value, attributes)


def _attr_key(attrs: Optional[Dict[str, str]]) -> str:
    if not attrs:
        return ""
    keys = sorted(attrs.keys())
    return ",".join(f"{k}={attrs[k]}" for k in keys)


class Meter:
    def __init__(self, resource: ResourceAttributes, exporter: Optional[OtlpHttpExporter]) -> None:
        self.resource = resource
        self.exporter = exporter
        self._counters: Dict[str, Dict[str, float]] = {}
        self._counter_opts: Dict[str, MetricOptions] = {}
        self._counter_meta: Dict[str, bool] = {}
        self._hists: Dict[str, Dict[str, List[float]]] = {}
        self._hist_opts: Dict[str, MetricOptions] = {}
        self._flushing = False

    def create_counter(self, name: str, options: Optional[MetricOptions] = None) -> Counter:
        if not SAFE_NAME_RE.match(name):
            raise ValueError(f"invalid metric name: {name!r}")
        self._counters.setdefault(name, {})
        self._counter_opts[name] = options or MetricOptions()
        self._counter_meta[name] = True
        return Counter(name, self, options)

    def create_up_down_counter(self, name: str, options: Optional[MetricOptions] = None) -> UpDownCounter:
        if not SAFE_NAME_RE.match(name):
            raise ValueError(f"invalid metric name: {name!r}")
        self._counters.setdefault(name, {})
        self._counter_opts[name] = options or MetricOptions()
        self._counter_meta[name] = False
        return UpDownCounter(name, self, options)

    def create_histogram(self, name: str, options: Optional[MetricOptions] = None) -> Histogram:
        if not SAFE_NAME_RE.match(name):
            raise ValueError(f"invalid metric name: {name!r}")
        self._hists.setdefault(name, {})
        self._hist_opts[name] = options or MetricOptions()
        return Histogram(name, self, options)

    def _add_counter(self, name: str, value: float, attributes: Optional[Dict[str, str]], monotonic: bool) -> None:
        self._counters.setdefault(name, {})
        k = _attr_key(attributes)
        self._counters[name][k] = self._counters[name].get(k, 0.0) + value

    def _record_histogram(self, name: str, value: float, attributes: Optional[Dict[str, str]]) -> None:
        self._hists.setdefault(name, {})
        k = _attr_key(attributes)
        slot = self._hists[name].get(k)
        if slot is None:
            slot = [0.0] * len(DEFAULT_BUCKETS_MS) + [0.0]  # trailing overflow bucket
            self._hists[name][k] = slot
        for i, bound in enumerate(DEFAULT_BUCKETS_MS):
            if value <= bound:
                slot[i] += 1
        slot[-1] += 1  # total observations always incremented

    def flush(self) -> None:
        if self.exporter is None:
            return
        if self._flushing:
            return
        self._flushing = True
        try:
            counters = self._counters
            hists = self._hists
            self._counters = {}
            self._hists = {}
            metric_payloads: List[Dict[str, Any]] = []

            for name, by_attrs in counters.items():
                opts = self._counter_opts.get(name, MetricOptions())
                monotonic = self._counter_meta.get(name, True)
                for k, v in by_attrs.items():
                    metric_payloads.append(
                        {
                            "name": name,
                            "description": opts.description,
                            "unit": opts.unit,
                            "sum": v,
                            "aggregationTemporality": 2,
                            "isMonotonic": monotonic,
                            "attributes": _string_attrs_to_otlp(_parse_attr_key(k)),
                        }
                    )

            for name, by_attrs in hists.items():
                opts = self._hist_opts.get(name, MetricOptions())
                for k, slot in by_attrs.items():
                    # slot layout: [bucket0, bucket1, ..., bucketN-1, total]
                    # bucketCounts in OTLP is cumulative — each entry is
                    # the count of observations whose value is <= the
                    # bound at the same index. The trailing overflow
                    # bucket equals the total count of observations.
                    bounds = list(DEFAULT_BUCKETS_MS)
                    counts = list(slot[:-1]) + [float(slot[-1])]
                    total = float(slot[-1])
                    metric_payloads.append(
                        {
                            "name": name,
                            "description": opts.description,
                            "unit": opts.unit,
                            "count": total,
                            "sum": 0.0,
                            "aggregationTemporality": 2,
                            "isMonotonic": True,
                            "bucketBounds": bounds,
                            "bucketCounts": counts,
                            "attributes": _string_attrs_to_otlp(_parse_attr_key(k)),
                        }
                    )

            if not metric_payloads:
                return

            payload = {
                "resourceMetrics": [
                    {
                        "resource": self.resource.to_otlp(),
                        "scopeMetrics": [
                            {
                                "scope": {"name": "@domio/observability-py"},
                                "metrics": metric_payloads,
                            }
                        ],
                    }
                ]
            }
            self.exporter.export_json("metrics", payload)
        finally:
            self._flushing = False

    def shutdown(self) -> None:
        self.flush()
        if self.exporter is not None:
            self.exporter.shutdown()


def _string_attrs_to_otlp(attrs: Dict[str, str]) -> List[Dict[str, Any]]:
    return [{"key": k, "value": {"stringValue": v}} for k, v in attrs.items()]


def _parse_attr_key(k: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not k:
        return out
    for pair in k.split(","):
        idx = pair.find("=")
        if idx <= 0:
            continue
        out[pair[:idx]] = pair[idx + 1:]
    return out