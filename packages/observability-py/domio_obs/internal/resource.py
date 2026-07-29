"""
Resource attribute builder.

Mirrors ``@domio/observability/src/resource.ts`` and the Go SDK. The
four required Phase 01 §5.B.3 attributes are always emitted; optional
attributes attach when present.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

MAX_KEY_LEN = 256
MAX_VAL_LEN = 1024
SAFE_KEY_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.\-]*$")
SAFE_VAL_RE = re.compile(r"^[a-zA-Z0-9._:/@=+,\-]*$")
SHA_RE = re.compile(r"^[0-9a-fA-F]{7,64}$")


class ResourceError(ValueError):
    """Raised when resource construction fails validation."""


@dataclass
class ResourceAttributes:
    service_name: str
    service_version: str = ""
    service_namespace: str = ""
    deployment_environment: str = ""
    git_sha: str = ""
    host_name: str = ""
    extras: Dict[str, str] = field(default_factory=dict)

    def to_otlp(self) -> Dict[str, Any]:
        pairs = [
            {"key": "service.name", "value": {"stringValue": self.service_name}},
            {"key": "service.version", "value": {"stringValue": self.service_version}},
            {"key": "deployment.environment", "value": {"stringValue": self.deployment_environment}},
            {"key": "git.sha", "value": {"stringValue": self.git_sha}},
        ]
        if self.service_namespace:
            pairs.append({"key": "service.namespace", "value": {"stringValue": self.service_namespace}})
        if self.host_name:
            pairs.append({"key": "host.name", "value": {"stringValue": self.host_name}})
        for k, v in self.extras.items():
            pairs.append({"key": k, "value": {"stringValue": v}})
        return {"attributes": pairs}


def _first_nonempty(*values: Optional[str]) -> str:
    for v in values:
        if v:
            return v
    return ""


def build_resource(
    service_name: str,
    service_version: Optional[str] = None,
    service_namespace: Optional[str] = None,
    environment: Optional[str] = None,
    git_sha: Optional[str] = None,
    host_name: Optional[str] = None,
    extra: Optional[Dict[str, str]] = None,
) -> ResourceAttributes:
    if not SAFE_KEY_RE.match(service_name) or len(service_name) > MAX_KEY_LEN:
        raise ResourceError(
            f"service.name must match ^[a-zA-Z][a-zA-Z0-9_.-]*$ and be <= {MAX_KEY_LEN} chars; "
            f"got {service_name!r}"
        )

    version = service_version if service_version is not None else os.environ.get("DOMIO_SERVICE_VERSION", "0.0.0+unknown")
    env = environment if environment is not None else _first_nonempty(
        os.environ.get("DOMIO_ENV"),
        os.environ.get("NODE_ENV"),
        "development",
    )
    sha = git_sha if git_sha is not None else _first_nonempty(
        os.environ.get("GIT_SHA"),
        os.environ.get("GITHUB_SHA"),
        "unknown",
    )

    if sha != "unknown" and not SHA_RE.match(sha):
        raise ResourceError(
            f"git.sha must be a 7..64 char hex string (or 'unknown'); got {sha!r}"
        )

    extras = dict(extra or {})
    for k, v in extras.items():
        if not SAFE_KEY_RE.match(k) or len(k) > MAX_KEY_LEN:
            raise ResourceError(f"resource attribute key {k!r} is invalid")
        if not SAFE_VAL_RE.match(v) or len(v) > MAX_VAL_LEN:
            raise ResourceError(f"resource attribute value for {k!r} is invalid")

    return ResourceAttributes(
        service_name=service_name,
        service_version=version,
        service_namespace=service_namespace or "",
        deployment_environment=env,
        git_sha=sha,
        host_name=host_name or "",
        extras=extras,
    )


# ---------- OTLP endpoint parsing ----------


class EndpointError(ValueError):
    """Raised when an OTLP endpoint URL is malformed."""


def parse_otlp_endpoint(raw: str) -> str:
    """Validates and returns the OTLP endpoint URL string."""
    if not raw or not raw.strip():
        raise EndpointError("OTLP endpoint must not be empty")
    from urllib.parse import urlparse
    try:
        u = urlparse(raw)
    except Exception as exc:
        raise EndpointError(f"OTLP endpoint is not a valid URL: {raw!r}") from exc
    if u.scheme not in ("http", "https"):
        raise EndpointError(f"OTLP endpoint must use http(s); got {u.scheme!r}")
    if not u.hostname:
        raise EndpointError("OTLP endpoint is missing host")
    return raw.rstrip("/")