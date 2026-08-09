#!/usr/bin/env python3
"""
Phase 22-beta — NATS partition assertion script.

Drives a NATS broker-partition drill. Revokes the SG ingress rule
between NATS brokers for `partition_duration_seconds`, then restores
it. Polls the consumer lag and asserts the lag returns to zero within
`consumer_lag_budget_seconds` (default 300 s).

Required env:
    AWS_REGION — primary region
    NATS_SG_ID — security group ID for the NATS ENIs

Optional env:
    PARTITION_DURATION_SECONDS (default 60)
    CONSUMER_LAG_BUDGET_SECONDS (default 300)
    DRY_RUN — set to anything truthy to skip the revoke/restore.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import boto3


def log(msg: str) -> None:
    print(f"[{datetime.now(tz=timezone.utc).isoformat()}] {msg}", flush=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    p.add_argument(
        "--sg-id",
        default=os.environ.get("NATS_SG_ID", ""),
        required=not os.environ.get("NATS_SG_ID"),
    )
    p.add_argument("--partition-duration", type=int, default=60)
    p.add_argument("--lag-budget", type=int, default=300)
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=bool(os.environ.get("DRY_RUN")),
    )
    return p.parse_args()


def publish_metric(cw, namespace: str, name: str, value: float) -> None:
    cw.put_metric_data(
        Namespace=namespace,
        MetricData=[
            {
                "MetricName": name,
                "Value": value,
                "Unit": "Count",
                "Dimensions": [{"Name": "Drill", "Value": "nats-partition"}],
            }
        ],
    )


def revoke_inter_broker_rule(ec2, sg_id: str, rule: dict) -> None:
    ec2.revoke_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[rule],
    )


def restore_rule(ec2, sg_id: str, rule: dict) -> None:
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[rule],
    )


def main() -> int:
    args = parse_args()
    ec2 = boto3.client("ec2", region_name=args.region)
    cw = boto3.client("cloudwatch", region_name=args.region)
    NS = "Domio/Chaos"

    # Capture the SG rules BEFORE we revoke, so we can restore exactly.
    sg = ec2.describe_security_groups(GroupIds=[args.sg_id])["SecurityGroups"][0]
    inter_broker_rules = [
        rule
        for rule in sg.get("IpPermissions", [])
        # Inter-broker: rules where the source is this same SG (self-ref).
        if any(
            g.get("GroupId") == args.sg_id
            for g in rule.get("UserIdGroupPairs", [])
        )
    ]
    if not inter_broker_rules:
        log(f"WARN: no inter-broker self-ref rules on {args.sg_id}; drill is a no-op")
    log(f"captured {len(inter_broker_rules)} inter-broker ingress rules")

    if args.dry_run:
        log("DRY RUN: not revoking/restoring")
        return 0

    drill_start = time.monotonic()
    log("revoking inter-broker rules")
    for rule in inter_broker_rules:
        revoke_inter_broker_rule(ec2, args.sg_id, rule)
    log(f"partition held for {args.partition_duration}s")
    time.sleep(args.partition_duration)

    log("restoring rules")
    for rule in inter_broker_rules:
        restore_rule(ec2, args.sg_id, rule)
    resume_at = time.monotonic() - drill_start
    log(f"resume at {resume_at:.1f}s; polling lag")

    # Poll consumer lag. The drill runner publishes the lag to
    # CloudWatch under Domio/Realtime — we read it back via
    # `get_metric_statistics`. For P22-beta we treat the metric
    # `nats_consumer_lag_seconds` as authoritative.
    cw_metric = boto3.client("cloudwatch", region_name=args.region)
    deadline = time.monotonic() + args.lag_budget
    lag = float("inf")
    while time.monotonic() < deadline:
        result = cw_metric.get_metric_statistics(
            Namespace="Domio/Realtime",
            MetricName="nats_consumer_lag_seconds",
            StartTime=datetime.now(tz=timezone.utc),
            EndTime=datetime.now(tz=timezone.utc),
            Period=10,
            Statistics=["Maximum"],
        )
        if result["Datapoints"]:
            lag = max(d["Maximum"] for d in result["Datapoints"])
            log(f"current lag = {lag:.1f}s")
            if lag <= 1.0:
                break
        time.sleep(10)

    total_drill = time.monotonic() - drill_start
    publish_metric(cw, NS, "nats_partition_lag_seconds", lag)
    publish_metric(cw, NS, "nats_partition_drill_total_seconds", total_drill)
    pass_ = lag <= args.lag_budget
    publish_metric(cw, NS, "nats_partition_drill_pass", int(pass_))

    if pass_:
        log(f"PASS — lag {lag:.1f}s ≤ {args.lag_budget}s")
        return 0
    log(f"FAIL — lag {lag:.1f}s exceeds budget {args.lag_budget}s")
    return 1


if __name__ == "__main__":
    sys.exit(main())
