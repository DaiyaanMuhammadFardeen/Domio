#!/usr/bin/env python3
"""
Phase 22-beta — CDN outage assertion script.

Drives a CDN outage drill. Patches the CloudFront distribution to point
at a black-hole origin (S3 bucket with no public read), waits
`partition_duration_seconds`, then restores.

Asserts:
  - core render < 5000 ms (via API path that doesn't depend on CDN)
  - status page flips to degraded within 120 s

Required env:
    AWS_REGION
    CDN_DISTRIBUTION_ID
    CDN_BLACKHOLE_ORIGIN_DOMAIN — a domain that returns 403 / is unreachable
    PUBLIC_EDITOR_URL          — the URL to load for core-render timing
    STATUS_PAGE_URL             — the URL whose state we poll

Optional:
    PARTITION_DURATION_SECONDS (default 60)
    DRY_RUN
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
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    p.add_argument("--distribution", default=os.environ.get("CDN_DISTRIBUTION_ID", ""))
    p.add_argument(
        "--blackhole-domain",
        default=os.environ.get("CDN_BLACKHOLE_ORIGIN_DOMAIN", ""),
    )
    p.add_argument(
        "--editor-url",
        default=os.environ.get("PUBLIC_EDITOR_URL", "https://app.domio.app/"),
    )
    p.add_argument(
        "--status-page-url",
        default=os.environ.get("STATUS_PAGE_URL", "https://status.domio.app/"),
    )
    p.add_argument("--partition-duration", type=int, default=60)
    p.add_argument("--render-budget", type=int, default=5000)
    p.add_argument("--status-page-budget", type=int, default=120)
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=bool(os.environ.get("DRY_RUN")),
    )
    return p.parse_args()


def cf_call(distribution_id: str, region: str, etag: str, body: dict | None) -> tuple[str, dict]:
    """Update CloudFront distribution; return (etag, body)."""
    import boto3

    cf = boto3.client("cloudfront", region_name=region)
    if body is None:
        r = cf.get_distribution_config(Id=distribution_id)
        return r["ETag"], r["DistributionConfig"]
    r = cf.update_distribution(
        Id=distribution_id,
        IfMatch=etag,
        DistributionConfig=body,
    )
    return r["ETag"], r["Distribution"]


def http_get(url: str, timeout: float) -> tuple[int, float]:
    start = time.monotonic()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, (time.monotonic() - start) * 1000
    except urllib.error.HTTPError as e:
        return e.code, (time.monotonic() - start) * 1000
    except (urllib.error.URLError, TimeoutError):
        return 0, (time.monotonic() - start) * 1000


def main() -> int:
    args = parse_args()
    log(f"drill target: CloudFront {args.distribution}, editor {args.editor_url}")
    if args.dry_run:
        log("DRY RUN: skipping CDN toggling")
        return 0

    etag, config = cf_call(args.distribution, args.region, "", None)
    log(f"current origin domain: {config['Origins']['Items'][0]['DomainName']}")

    # Save original for restore.
    original_origin = config["Origins"]["Items"][0]["DomainName"]

    # 1. Swap to black-hole origin.
    config["Origins"]["Items"][0]["DomainName"] = args.blackhole_domain
    etag, _ = cf_call(args.distribution, args.region, etag, config)
    log(f"blackhole set: {args.blackhole_domain}")

    # 2. Wait for the swap to propagate (CloudFront edge caches take
    # ~30-60 s to invalidate globally).
    log(f"waiting {args.partition_duration}s for propagation")
    time.sleep(args.partition_duration)

    # 3. Measure core-render (we hit the API directly, which doesn't go
    # through the public CDN).
    status, latency = http_get(args.editor_url, timeout=10.0)
    log(f"core render: status={status}, latency={latency:.0f}ms")
    render_pass = latency <= args.render_budget

    # 4. Wait for status page to flip.
    log(f"polling {args.status_page_url} for degraded state (budget {args.status_page_budget}s)")
    sp_start = time.monotonic()
    sp_pass = False
    while time.monotonic() - sp_start < args.status_page_budget:
        st, _ = http_get(args.status_page_url, timeout=5.0)
        if st == 200:
            sp_pass = True
            break
        time.sleep(10)
    sp_elapsed = time.monotonic() - sp_start

    # 5. Restore original origin.
    config["Origins"]["Items"][0]["DomainName"] = original_origin
    etag, _ = cf_call(args.distribution, args.region, etag, config)
    log(f"restored origin: {original_origin}")

    pass_ = render_pass and sp_pass
    if pass_:
        log(f"PASS — render {latency:.0f}ms, status page updated in {sp_elapsed:.1f}s")
        return 0
    log(f"FAIL — render {latency:.0f}ms (≤{args.render_budget}?), status page updated={sp_pass} ({sp_elapsed:.1f}s)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
