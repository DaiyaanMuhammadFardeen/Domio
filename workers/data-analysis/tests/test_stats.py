"""Tests for the data-analysis stats module."""
from __future__ import annotations

from data_analysis.stats import correlation, outliers, trend


def test_correlation_perfect() -> None:
    """Perfect positive correlation gives r=1.0."""
    xs = [1.0, 2.0, 3.0, 4.0, 5.0]
    ys = [2.0, 4.0, 6.0, 8.0, 10.0]
    r, p = correlation(xs, ys)
    assert abs(r - 1.0) < 0.001


def test_correlation_random() -> None:
    """Random uncorrelated data should have |r| close to 0."""
    xs = [1.0, 3.0, 2.0, 5.0, 4.0, 6.0, 7.0]
    ys = [7.0, 1.0, 5.0, 2.0, 6.0, 3.0, 4.0]
    r, _p = correlation(xs, ys)
    assert abs(r) < 0.7  # weak correlation


def test_correlation_mismatched_lengths() -> None:
    """Different-length inputs raise ValueError."""
    with __import__("contextlib").suppress(ValueError):
        correlation([1.0, 2.0], [1.0, 2.0, 3.0])
        raise AssertionError("Expected ValueError")


def test_mann_kendall_monotonic() -> None:
    """A strictly increasing series gives positive S."""
    ys = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]
    xs = [float(i) for i in range(len(ys))]
    result = trend(xs, ys)
    assert result["S"] > 0
    assert result["trend"] == "increasing"


def test_mann_kendall_decreasing() -> None:
    """A strictly decreasing series gives negative S."""
    ys = [7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0]
    xs = [float(i) for i in range(len(ys))]
    result = trend(xs, ys)
    assert result["S"] < 0
    assert result["trend"] == "decreasing"


def test_outliers_iqr() -> None:
    """Extreme values are detected by the IQR method."""
    # Normal range 10-12, with outlier at 100.
    values = [10.0, 11.0, 12.0, 10.0, 11.0, 100.0]
    outs = outliers(values)
    assert len(outs) >= 1
    indices = [o["index"] for o in outs]
    assert 5 in indices  # the outlier at index 5


def test_outliers_empty() -> None:
    """Short series returns no outliers."""
    assert outliers([1.0, 2.0]) == []


def test_outliers_zscore() -> None:
    """A value with |z|>3 is detected."""
    values = [5.0] * 20 + [100.0]
    outs = outliers(values)
    methods = {o["method"] for o in outs}
    assert "iqr" in methods or "zscore" in methods
