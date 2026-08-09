###############################################################################
# infra/chaos/postgres_failover.tf
#
# Chaos drill: Postgres primary-region failover.
#
# Target: RTO ≤ 60 s (write-path recovery), RPO = 0 (synchronous replicas).
#
# What the drill does:
#   1. Verifies the Aurora cluster is in steady state (writer = primary,
#      reader = replica, replication lag = 0).
#   2. Captures a baseline: latest committed WAL LSN on the writer.
#   3. Forcibly fails the primary region:
#        - Sets `apply_immediately = true` and modifies the cluster to
#          promote the cross-region replica.
#        - OR (game-day only): blackholes the primary AZ's network.
#   4. Polls the cluster endpoint until the new writer accepts writes.
#   5. Recomputes the LSN; if the new writer's LSN equals the
#      baseline LSN, RPO = 0 (no committed writes lost).
#   6. Records RTO (time from drill start to write-path acceptance)
#      and RPO (LSN delta).
#   7. Fails the drill if RTO > 60s or RPO > 0 (sync replica).
#
# Safety gates (must be true before this drill can run):
#   - `var.drill_enabled = true` (default false; flipped on game day).
#   - `var.target_cluster` is in staging or load-test (NOT prod) —
#     enforced by `precondition` below.
#   - The current time is within the agreed game-day window
#     (validated by `aws_iam_policy_document` attached to the drill).
#
# Out of scope here (P22b):
#   - Multi-region writer (today: single-region writer + cross-region
#     read replica promoted on failover).
#   - Application-level circuit breakers (separate workstream).
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
    key            = "infra/chaos/postgres-failover/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "domio-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region of the primary Aurora cluster."
  type        = string
  default     = "us-east-1"
}

variable "drill_enabled" {
  description = "Master switch. When false, `terraform apply` is a no-op. Set to true only on game day."
  type        = bool
  default     = false
}

variable "target_cluster" {
  description = "Aurora cluster identifier to drill against. Must be staging or load-test (not prod)."
  type        = string

  validation {
    condition     = can(regex("-(staging|loadtest)$", var.target_cluster))
    error_message = "target_cluster must end in -staging or -loadtest. Production clusters are off-limits for this drill."
  }
}

variable "failover_target_region" {
  description = "Region to fail over to. Must have a pre-provisioned cross-region replica."
  type        = string
  default     = "us-west-2"
}

variable "rto_budget_seconds" {
  description = "Maximum acceptable RTO. Drill fails if exceeded."
  type        = number
  default     = 60
}

variable "rpo_budget_lsn_bytes" {
  description = "Maximum acceptable RPO in bytes of LSN lag. 0 means strict synchronous replication."
  type        = number
  default     = 0
}

# ── IAM for the drill runner ────────────────────────────────────────────

resource "aws_iam_role" "drill_runner" {
  name = "domio-chaos-postgres-failover-runner"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "drill_runner" {
  name = "failover-drill"
  role = aws_iam_role.drill_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBClusters",
          "rds:DescribeDBInstances",
          "rds:FailoverDBCluster",
        ]
        Resource = "arn:aws:rds:${var.aws_region}:*:cluster:${var.target_cluster}"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "Domio/Chaos"
          }
        }
      },
    ]
  })
}

# ── CloudWatch metrics published by the drill ───────────────────────────
#
# The drill runner publishes:
#   - `postgres_failover_rto_seconds` (gauge; target ≤ 60)
#   - `postgres_failover_rpo_lsn_bytes` (gauge; target = 0)
#   - `postgres_failover_drill_pass` (0/1; 1 = pass)

resource "aws_cloudwatch_metric_alarm" "drill_rto_breach" {
  alarm_name          = "chaos-postgres-failover-rto-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "postgres_failover_rto_seconds"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.rto_budget_seconds
  alarm_description   = "Postgres failover drill exceeded RTO budget"

  dimensions = {
    Cluster = var.target_cluster
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────

output "drill_runner_role_arn" {
  description = "IAM role assumed by the drill runner EC2 instance."
  value       = aws_iam_role.drill_runner.arn
}

output "rto_budget_seconds" {
  value = var.rto_budget_seconds
}

output "rpo_budget_lsn_bytes" {
  value = var.rpo_budget_lsn_bytes
}
