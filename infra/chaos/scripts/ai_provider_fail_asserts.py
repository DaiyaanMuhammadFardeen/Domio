#!/usr/bin/env python3
"""
Phase 22-beta — AI provider failure assertion script.

Drives an AI provider 5xx drill using Toxiproxy and a synthetic request.
Asserts:
  - user-visible degradation ≤ 5 s (circuit breaker opens + fallback served)
  - no client hang > 30 s

Required env:
    TOXIPROXY_ENDPOINT — e.g. http://toxiproxy.staging:8474
    AI_HEALTH_URL      — the AI service's health/ping URL (must traverse the proxy)
    DRY_RUN            — skip the proxy toggle if set
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone


def log(msg: str) -> None:
    print(f"[{datetime.now(tz=timezone.utc).isoformat()}] {msg}", flush=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--toxiproxy", default=os.environ.get("TOXIPROXY_ENDPOINT", ""))
    p.add_argument("--ai-url", default=os.environ.get("AI_HEALTH_URL", ""))
    p.add_argument("--toxic", default=os.environ.get("AI_TOXIC_NAME", "ai-primary"))
    p.add_argument("--degradation-budget", type=int, default=5)
    p.add_argument("--hang-budget", type=int, default=30)
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=bool(os.environ.get("DRY_RUN")),
    )
    return p.parse_args()


def toxiproxy_call(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def http_get(url: str, timeout: float) -> tuple[int, float]:
    """Returns (status, latency_ms)."""
    start = time.monotonic()
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, (time.monotonic() - start) * 1000
    except urllib.error.HTTPError as e:
        return e.code, (time.monotonic() - start) * 1000
    except (urllib.error.URLError, TimeoutError):
        return 0, (time.monotonic() - start) * 1000


def main() -> int:
    args = parse_args()
    if not args.toxiproxy or not args.ai_url:
        sys.exit("REFUSING: --toxiproxy and --ai-url required")

    log(f"drill target: AI primary via {args.toxiproxy} → AI URL {args.ai_url}")
    if args.dry_run:
        log("DRY RUN: skipping toxiproxy toggle")
        return 0

    # 1. Inject 5xx toxic.
    log(f"adding toxic to {args.toxic}: status=500, 100% rate")
    code, body = toxiproxy_call(
        args.toxiproxy,
        "POST",
        f"/proxies/{args.toxic}/toxics",
        {"type": "status", "attributes": {"code": 500}, "toxicity": 1.0},
    )
    log(f"  → {code} {body[:200]}")

    # 2. Issue a request and time the fallback.
    drill_start = time.monotonic()
    status = 0
    while time.monotonic() - drill_start < args.hang_budget:
        status, latency = http_get(args.ai_url, timeout=2.0)
        # We expect the AI service to:
        #   - return 5xx briefly while circuit is opening
        #   - then return 200 with a fallback body (cached) OR 503 with
        #     a clear "AI unavailable" message.
        if status in (200, 503):
            break
        time.sleep(0.5)
    elapsed = time.monotonic() - drill_start
    log(f"first acceptable response in {elapsed:.2f}s (status={status})")

    # 3. Clean up.
    log("removing toxic")
    toxiproxy_call(args.toxiproxy, "DELETE", f"/proxies/{args.toxic}/toxics/status")

    pass_ = elapsed <= args.degradation_budget
    if pass_:
        log(f"PASS — degradation {elapsed:.2f}s ≤ {args.degradation_budget}s")
        return 0
    log(f"FAIL — degradation {elapsed:.2f}s exceeds budget {args.degradation_budget}s")
    return 1


if __name__ == "__main__":
    sys.exit(main())
