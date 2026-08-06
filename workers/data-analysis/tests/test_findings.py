"""Tests for the data-analysis findings module."""
from __future__ import annotations

from data_analysis.findings import summarise


def test_findings_summary_stats() -> None:
    """Each series produces a summary Finding."""
    data = {"revenue": [100.0, 200.0, 300.0]}
    findings = summarise(data)
    summaries = [f for f in findings if f.kind == "summary"]
    assert len(summaries) == 1
    assert "min=" in summaries[0].description
    assert "max=" in summaries[0].description


def test_findings_correlation() -> None:
    """Strongly correlated series produce a correlation Finding."""
    n = 20
    x = [float(i) for i in range(n)]
    y = [float(i) * 2 for i in range(n)]
    data = {"x": x, "y": y}
    findings = summarise(data)
    corrs = [f for f in findings if f.kind == "correlation"]
    assert len(corrs) >= 1
    assert "correlation" in corrs[0].description.lower()


def test_findings_trend() -> None:
    """A monotonic series produces a trend Finding."""
    data = {"growth": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]}
    findings = summarise(data)
    trends = [f for f in findings if f.kind == "trend"]
    assert len(trends) >= 1
    assert "increasing" in trends[0].description.lower()


def test_findings_outlier() -> None:
    """An outlier value produces an outlier Finding."""
    data = {"metric": [10.0, 11.0, 12.0, 10.0, 11.0, 100.0]}
    findings = summarise(data)
    outliers_f = [f for f in findings if f.kind == "outlier"]
    assert len(outliers_f) >= 1
    assert "outlier" in outliers_f[0].description.lower()
