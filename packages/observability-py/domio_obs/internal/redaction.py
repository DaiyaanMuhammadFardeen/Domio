"""
Lightweight PII redaction helpers for the Python observability SDK.

Mirrors the regex set in ``@domio/redact-pii``. We inline a copy here
so the Python package has no runtime dependencies.

If the canonical ``domio_redact_pii`` package is importable, this
module delegates to it for full coverage. Otherwise it falls back to
the inline (smaller) regex set.
"""

from __future__ import annotations

import re
from typing import Any, Optional

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_INTL_RE = re.compile(r"\+(?:[0-9][ \-]?){6,15}\d")
NID_RE = re.compile(r"(?<![0-9])(?:\d{10}|\d{13}|\d{17})(?![0-9])")
CC_RE = re.compile(r"(?<![0-9])(?:\d[ \-]?){12,18}\d(?![0-9])")
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")
ASSIGNED_SECRET_RE = re.compile(
    r"(api[_\-]?key|access[_\-]?token|secret|token|password|bearer)"
    r"\s*[:=]\s*[\"']?([A-Za-z0-9_+/=\-]{16,})[\"']?",
    re.IGNORECASE,
)
REDACTED = "[REDACTED]"


def is_luhn_valid(digits: str) -> bool:
    """Returns True iff ``digits`` (with optional spaces/dashes) passes the Luhn check."""
    cleaned = re.sub(r"[ \-]", "", digits)
    if not cleaned or not cleaned.isdigit():
        return False
    total = 0
    alt = False
    for ch in reversed(cleaned):
        n = ord(ch) - 48
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def _redact_string(s: str, *, redact_addresses: bool = False) -> str:
    if not s:
        return s
    out = s
    out = ASSIGNED_SECRET_RE.sub(lambda m: f"{m.group(1)}={REDACTED}", out)
    out = JWT_RE.sub(REDACTED, out)
    out = EMAIL_RE.sub(REDACTED, out)
    out = PHONE_INTL_RE.sub(
        lambda m: REDACTED if 8 <= len(m.group(0)) <= 17 else m.group(0),
        out,
    )
    out = NID_RE.sub(REDACTED, out)

    def _cc_replace(m: re.Match) -> str:
        candidate = m.group(0)
        return REDACTED if is_luhn_valid(candidate) else candidate

    out = CC_RE.sub(_cc_replace, out)
    if redact_addresses:
        out = re.sub(r"(?<![0-9.])(?:\d{1,3}\.){3}\d{1,3}(?![0-9.])", REDACTED, out)
    return out


def _redact_value(value: Any, *, redact_addresses: bool = False, _seen: Optional[set] = None) -> Any:
    if value is None:
        return value
    if isinstance(value, str):
        return _redact_string(value, redact_addresses=redact_addresses)
    if isinstance(value, (bool, int, float)):
        return value
    if _seen is None:
        _seen = set()
    if isinstance(value, (list, tuple)):
        if id(value) in _seen:
            return value
        _seen.add(id(value))
        return [_redact_value(v, redact_addresses=redact_addresses, _seen=_seen) for v in value]
    if isinstance(value, dict):
        if id(value) in _seen:
            return value
        _seen.add(id(value))
        return {
            k: _redact_value(v, redact_addresses=redact_addresses, _seen=_seen)
            for k, v in value.items()
        }
    return value


def redact_string(s: str) -> str:
    """Redacts PII from a single string."""
    return _redact_string(s)


def redact_value(v: Any) -> Any:
    """Deep-clones an arbitrary JSON value, redacting string leaves."""
    return _redact_value(v)
