###############################################################################
# infra/chaos/nats_partition.tf
#
# Chaos drill: NATS broker partition.
#
# Target: consumers backpressure correctly; no data loss on resume;
# consumer lag returns to zero within 5 minutes.
#
# What the drill does:
#   1. Verifies the NATS cluster is in steady state (no consumer lag).
#   2. Captures the baseline consumer lag.
#   3. Blocks inter-broker traffic (security-group rule) for 60 seconds.
#   4. Restores traffic.
#   5. Polls consumer lag until it returns to zero (or budget exceeded).
#   6. Asserts: no committed-but-unprocessed messages, lag ≤ 300 s after
#      resume.
#
# Why this is a separate drill from Postgres failover:
#   - The fail semantics are different (NATS queues messages durably;
#     Postgres relies on synchronous replicas).
#   - The application impact is different (broker partition stalls
#     realtime, not writes).
#
# Out of scope here (P22b):
#   - Multi-region NATS (today: single-region NATS cluster).
#   - JetStream key-value store chaos (separate drill).
###############################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }

  backend "s3" {
    bucket         = "domio-tf-state"
    key            = "infra/chaos/nats-partition/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "domio-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "drill_enabled" {
  description = "Master switch. False by default; true on game day."
  type        = bool
  default     = false
}

variable "nats_security_group_id" {
  description = "Security group attached to the NATS broker ENIs."
  type        = string
}

variable "partition_duration_seconds" {
  description = "How long to hold the partition. Default 60s — long enough to exercise resume."
  type        = number
  default     = 60
}

variable "consumer_lag_budget_seconds" {
  description = "Maximum acceptable time for consumer lag to drain after resume."
  type        = number
  default     = 300
}

# ── IAM for the drill runner ────────────────────────────────────────────

resource "aws_iam_role" "drill_runner" {
  name = "domio-chaos-nats-partition-runner"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "drill_runner" {
  name = "nats-partition-drill"
  role = aws_iam_role.drill_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeSecurityGroups",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupIngress",
        ]
        Resource = "arn:aws:ec2:${var.aws_region}:*:security-group/${var.nats_security_group_id}"
      },
      {
        Effect = "Allow"
        Action = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "Domio/Chaos" }
        }
      },
    ]
  })
}

# ── CloudWatch alarms ───────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "drill_lag_breach" {
  alarm_name          = "chaos-nats-partition-lag-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "nats_partition_lag_seconds"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.consumer_lag_budget_seconds
  alarm_description   = "NATS partition drill exceeded consumer-lag budget"

  dimensions = {
    Drill = "nats-partition"
  }
}

output "drill_runner_role_arn" {
  value = aws_iam_role.drill_runner.arn
}

output "partition_duration_seconds" {
  value = var.partition_duration_seconds
}

output "consumer_lag_budget_seconds" {
  value = var.consumer_lag_budget_seconds
}
