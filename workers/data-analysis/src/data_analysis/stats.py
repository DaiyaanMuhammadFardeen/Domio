"""Statistical analysis functions — correlation, trend, outliers.

Pure-Python implementations with optional scipy acceleration.
"""
from __future__ import annotations

import math
import statistics
from typing import Any


def correlation(xs: list[float], ys: list[float]) -> tuple[float, float | None]:
    """Compute Pearson correlation coefficient between two numeric series.

    Returns ``(r, p_value)`` where *p_value* is ``None`` when scipy is
    unavailable.  Requires ``len(xs) == len(ys) >= 3``.
    """
    if len(xs) != len(ys):
        raise ValueError("xs and ys must have the same length")
    n = len(xs)
    if n < 3:
        raise ValueError("Need at least 3 data points for correlation")

    # Try scipy first for the p-value.
    try:
        from scipy.stats import pearsonr  # type: ignore[import-untyped]

        result = pearsonr(xs, ys)
        return float(result.statistic), float(result.pvalue)
    except ImportError:
        pass

    # Pure-Python fallback.
    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(ys)
    sx = statistics.stdev(xs)
    sy = statistics.stdev(ys)
    if sx == 0 or sy == 0:
        return 0.0, None
    r = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True)) / (
        (n - 1) * sx * sy
    )
    return r, None


def trend(xs: list[float], ys: list[float]) -> dict[str, Any]:
    """Detect monotonic trend using the Mann-Kendall S statistic.

    Returns a dict with keys:
    - ``S``: the Mann-Kendall S statistic
    - ``z``: normalised z approximation
    - ``trend``: ``"increasing"`` | ``"decreasing"`` | ``"no trend"``
    - ``p_value``: two-sided p-value (None if scipy unavailable)

    The input *ys* is the time series; *xs* is the time index (typically
    ``range(len(ys))``).  Only *ys* is used for the S statistic.
    """
    if len(ys) < 3:
        return {"S": 0, "z": 0.0, "trend": "no trend", "p_value": None}

    n = len(ys)
    s = 0
    for k in range(n - 1):
        for j in range(k + 1, n):
            diff = ys[j] - ys[k]
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    # Variance without ties for simplicity.
    var_s = n * (n - 1) * (2 * n + 5) / 18.0
    if var_s == 0:
        z = 0.0
    elif s > 0:
        z = (s - 1) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s)
    else:
        z = 0.0

    # Two-sided p-value from scipy if available.
    p_value: float | None = None
    try:
        from scipy.stats import norm

        p_value = 2.0 * (1.0 - float(norm.cdf(abs(z))))
    except ImportError:
        pass

    if s > 0:
        direction = "increasing"
    elif s < 0:
        direction = "decreasing"
    else:
        direction = "no trend"

    return {"S": s, "z": z, "trend": direction, "p_value": p_value}


def outliers(values: list[float]) -> list[dict[str, Any]]:
    """Detect outliers using IQR and z-score (|z| > 3) methods.

    Returns a list of dicts with keys ``index``, ``value``, ``method``,
    where ``method`` is ``"iqr"`` or ``"zscore"`` (union of both methods).
    """
    if len(values) < 4:
        return []

    n = len(values)
    mean = statistics.fmean(values)
    stdev = statistics.stdev(values)

    # IQR method.
    sorted_vals = sorted(values)
    q1_idx = n // 4
    q3_idx = (3 * n) // 4
    q1 = sorted_vals[q1_idx]
    q3 = sorted_vals[q3_idx]
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr

    seen: set[int] = set()
    result: list[dict[str, Any]] = []

    for i, v in enumerate(values):
        if v < lower or v > upper:
            result.append({"index": i, "value": v, "method": "iqr"})
            seen.add(i)

    # Z-score method.
    if stdev > 0:
        for i, v in enumerate(values):
            if i in seen:
                continue
            z = abs((v - mean) / stdev)
            if z > 3:
                result.append({"index": i, "value": v, "method": "zscore"})
                seen.add(i)

    return result
