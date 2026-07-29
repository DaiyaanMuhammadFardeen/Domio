"""Tests for resource attribute construction and OTLP endpoint parsing."""

from __future__ import annotations

import pytest

from domio_obs.internal.resource import (
    EndpointError,
    ResourceError,
    build_resource,
    parse_otlp_endpoint,
)


def test_resource_emits_required_attrs() -> None:
    r = build_resource(
        service_name="apps-web",
        service_version="0.1.0",
        environment="development",
        git_sha="7cbc65a",
    )
    assert r.service_name == "apps-web"
    assert r.service_version == "0.1.0"
    assert r.deployment_environment == "development"
    assert r.git_sha == "7cbc65a"


def test_resource_short_sha_accepted() -> None:
    r = build_resource(service_name="svc", git_sha="0123457")
    assert r.git_sha == "0123457"


def test_resource_full_sha_accepted() -> None:
    sha = "0123456789abcdef0123456789abcdef01234567"
    r = build_resource(service_name="svc", git_sha=sha)
    assert r.git_sha == sha


def test_resource_uppercase_sha_accepted() -> None:
    r = build_resource(service_name="svc", git_sha="ABCDEF1")
    assert r.git_sha == "ABCDEF1"


def test_resource_default_unknown_sha(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GIT_SHA", raising=False)
    monkeypatch.delenv("GITHUB_SHA", raising=False)
    r = build_resource(service_name="svc")
    assert r.git_sha == "unknown"


def test_resource_env_sha(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIT_SHA", "123abc7")
    r = build_resource(service_name="svc")
    assert r.git_sha == "123abc7"


def test_resource_env_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOMIO_ENV", "staging")
    r = build_resource(service_name="svc")
    assert r.deployment_environment == "staging"


def test_resource_optional_namespace_and_host() -> None:
    r = build_resource(
        service_name="svc",
        service_namespace="domio",
        host_name="pod-123",
    )
    assert r.service_namespace == "domio"
    assert r.host_name == "pod-123"


def test_resource_extra_attributes() -> None:
    r = build_resource(
        service_name="svc",
        extra={"domio.region": "us_east_1"},
    )
    assert r.extras["domio.region"] == "us_east_1"


def test_resource_rejects_invalid_service_names() -> None:
    for bad in ["has space", "has#hash", ""]:
        with pytest.raises(ResourceError):
            build_resource(service_name=bad)


def test_resource_rejects_invalid_git_sha() -> None:
    with pytest.raises(ResourceError):
        build_resource(service_name="svc", git_sha="abc")
    with pytest.raises(ResourceError):
        build_resource(service_name="svc", git_sha="g" * 40)


def test_resource_rejects_invalid_extra_keys() -> None:
    with pytest.raises(ResourceError):
        build_resource(service_name="svc", extra={"1starts_with_digit": "v"})
    long_key = "k" * 300
    with pytest.raises(ResourceError):
        build_resource(service_name="svc", extra={long_key: "v"})


def test_resource_rejects_invalid_extra_values() -> None:
    with pytest.raises(ResourceError):
        build_resource(service_name="svc", extra={"region": "us east 1"})


# ---------- Endpoint parsing ----------


@pytest.mark.parametrize(
    "raw",
    ["http://localhost:4318", "https://collector.example.com:4318", "http://127.0.0.1:4318/v1/traces"],
)
def test_endpoint_parses_good(raw: str) -> None:
    assert parse_otlp_endpoint(raw) is not None


@pytest.mark.parametrize("raw", ["", "not-a-url", "ftp://nope", "file:///etc/passwd", "gopher://x", "http://"])
def test_endpoint_rejects_bad(raw: str) -> None:
    with pytest.raises(EndpointError):
        parse_otlp_endpoint(raw)


def test_endpoint_strips_trailing_slash() -> None:
    assert parse_otlp_endpoint("http://collector/") == "http://collector"
