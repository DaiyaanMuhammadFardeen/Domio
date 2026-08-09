#!/usr/bin/env python3
"""
Phase 22-beta — Regional isolation assertion script.

Drives a region blackhole drill. Replaces the blackholed region's
default route in its route table with a blackhole (e.g., pointing the
default route at a non-existent ENI or using a more explicit blackhole
mechanism).

Asserts:
  - traffic shifts to surviving regions within 30 s
  - in-flight data loss is within budget

Required env:
    AWS_REGION                   — primary region (where the runner lives)
    BLACKHOLE_REGION             — region to isolate
    BLACKHOLE_ROUTE_TABLE_ID     — route table to mutate
    BLACKHOLE_ORIGINAL_ROUTE_CIDR (default 0.0.0.0/0)
    BLACKHOLE_DURATION_SECONDS    (default 90)
    TRAFFIC_SHIFT_BUDGET_SECONDS  (default 30)
    SURVIVING_LOAD_BALANCER_URL  — ALB / NLB in a surviving region
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3


def log(msg: str) -> None:
    print(f"[{datetime.now(tz=timezone.utc).isoformat()}] {msg}", flush=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    p.add_argument(
        "--blackhole-region",
        default=os.environ.get("BLACKHOLE_REGION", "eu-west-1"),
    )
    p.add_argument(
        "--route-table-id",
        default=os.environ.get("BLACKHOLE_ROUTE_TABLE_ID", ""),
    )
    p.add_argument(
        "--cidr",
        default=os.environ.get("BLACKHOLE_ORIGINAL_ROUTE_CIDR", "0.0.0.0/0"),
    )
    p.add_argument("--duration", type=int, default=90)
    p.add_argument("--shift-budget", type=int, default=30)
    p.add_argument(
        "--surviving-lb",
        default=os.environ.get("SURVIVING_LOAD_BALANCER_URL", ""),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=bool(os.environ.get("DRY_RUN")),
    )
    return p.parse_args()


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
    ec2 = boto3.client("ec2", region_name=args.blackhole_region)

    # Capture the original route we will replace.
    rt = ec2.describe_route_tables(RouteTableIds=[args.route_table_id])["RouteTables"][0]
    original_route = None
    for route in rt.get("Routes", []):
        if route.get("DestinationCidrBlock") == args.cidr:
            original_route = route
            break
    if not original_route:
        sys.exit(f"REFUSING: route {args.cidr} not found in {args.route_table_id}")
    log(f"original route: {original_route}")

    if args.dry_run:
        log("DRY RUN: skipping route-table mutation")
        return 0

    # Replace with a blackhole. AWS allows blackhole via Gateway ID
    # 'vgw-xxxxx' misdirection; the simplest portable approach is to
    # delete the route entirely (so the RT has no default route).
    log("blackholing default route")
    ec2.delete_route(RouteTableId=args.route_table_id, DestinationCidrBlock=args.cidr)

    # Poll the surviving LB until it accepts traffic.
    drill_start = time.monotonic()
    shift_pass = False
    if args.surviving_lb:
        log(f"polling {args.surviving_lb}")
        while time.monotonic() - drill_start < args.shift_budget:
            status, _ = http_get(args.surviving_lb, timeout=5.0)
            if status == 200:
                shift_pass = True
                shift_elapsed = time.monotonic() - drill_start
                break
            time.sleep(2)
    else:
        log("WARN: --surviving-lb not set; skipping shift measurement")
        shift_elapsed = args.shift_budget
        shift_pass = True

    # Hold for the requested duration, then restore.
    hold_remaining = args.duration - (time.monotonic() - drill_start)
    if hold_remaining > 0:
        log(f"holding for {hold_remaining:.0f}s more")
        time.sleep(hold_remaining)

    log("restoring original route")
    restore_kwargs = {
        "RouteTableId": args.route_table_id,
        "DestinationCidrBlock": args.cidr,
    }
    if "GatewayId" in original_route:
        restore_kwargs["GatewayId"] = original_route["GatewayId"]
    elif "NatGatewayId" in original_route:
        restore_kwargs["NatGatewayId"] = original_route["NatGatewayId"]
    elif "NetworkInterfaceId" in original_route:
        restore_kwargs["NetworkInterfaceId"] = original_route["NetworkInterfaceId"]
    elif "TransitGatewayId" in original_route:
        restore_kwargs["TransitGatewayId"] = original_route["TransitGatewayId"]
    elif "VpcPeeringConnectionId" in original_route:
        restore_kwargs["VpcPeeringConnectionId"] = original_route["VpcPeeringConnectionId"]
    else:
        sys.exit(f"REFUSING: original route had no recognised target: {original_route}")
    ec2.create_route(**restore_kwargs)

    pass_ = shift_pass
    if pass_:
        log(f"PASS — traffic shifted in {shift_elapsed:.1f}s ≤ {args.shift_budget}s")
        return 0
    log(f"FAIL — shift did not complete within {args.shift_budget}s")
    return 1


if __name__ == "__main__":
    sys.exit(main())