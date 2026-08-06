"""Findings — structured output from data analysis."""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any, Literal

from data_analysis.stats import correlation, outliers, trend


@dataclass
class Finding:
    """A single analytical finding for a slide."""

    kind: Literal["correlation", "trend", "outlier", "summary"]
    description: str
    evidence: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    severity: Literal["info", "warning"] = "info"


def _summarise_series(name: str, values: list[float]) -> Finding:
    """Produce a basic summary statistic Finding."""
    desc = (
        f"{name}: min={min(values):.2f}, max={max(values):.2f}, "
        f"mean={statistics.fmean(values):.2f}"
    )
    return Finding(
        kind="summary",
        description=desc,
        evidence={
            "series": name,
            "min": min(values),
            "max": max(values),
            "mean": statistics.fmean(values),
            "stdev": statistics.stdev(values) if len(values) > 1 else 0.0,
            "count": len(values),
        },
        confidence=1.0,
        severity="info",
    )


def summarise(data: dict[str, list[float]]) -> list[Finding]:
    """Analyse all numeric series and return a list of Findings.

    Automatically detects:
    - Strong correlations (|r| > 0.7)
    - Monotonic trends (Mann-Kendall S != 0)
    - Outliers (IQR + z-score)
    - Basic summary stats (min/max/mean)
    """
    findings: list[Finding] = []
    series_names = list(data.keys())

    # Pairwise correlation.
    for i in range(len(series_names)):
        for j in range(i + 1, len(series_names)):
            name_a = series_names[i]
            name_b = series_names[j]
            a = data[name_a]
            b = data[name_b]
            if len(a) != len(b) or len(a) < 3:
                continue
            r, p = correlation(a, b)
            if abs(r) > 0.7:
                desc = (
                    f"Strong {'positive' if r > 0 else 'negative'} "
                    f"correlation between {name_a} and {name_b} (r={r:.3f})"
                )
                evidence: dict[str, Any] = {
                    "series_a": name_a,
                    "series_b": name_b,
                    "r": r,
                }
                if p is not None:
                    evidence["p_value"] = p
                findings.append(Finding(
                    kind="correlation",
                    description=desc,
                    evidence=evidence,
                    confidence=0.9 if p is not None and p < 0.05 else 0.7,
                    severity="warning" if abs(r) > 0.9 else "info",
                ))

    # Per-series trend + outliers + summary.
    for name, values in data.items():
        if len(values) < 3:
            continue

        # Trend.
        xs = [float(i) for i in range(len(values))]
        t = trend(xs, values)
        if t["S"] != 0:
            confidence = 0.85 if t["p_value"] is not None and t["p_value"] < 0.05 else 0.6
            findings.append(Finding(
                kind="trend",
                description=f"{name} shows a {t['trend']} trend (S={t['S']})",
                evidence={"series": name, **t},
                confidence=confidence,
                severity="info",
            ))

        # Outliers.
        outs = outliers(values)
        if outs:
            findings.append(Finding(
                kind="outlier",
                description=f"{name} has {len(outs)} outlier(s)",
                evidence={"series": name, "outliers": outs},
                confidence=0.8,
                severity="warning",
            ))

        # Summary.
        findings.append(_summarise_series(name, values))

    return findings
