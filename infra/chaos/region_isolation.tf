###############################################################################
# infra/chaos/region_isolation.tf
#
# Chaos drill: one region blackholed; traffic shifts to surviving regions.
#
# Target: traffic shift within 30 s; no data loss.
#
# What the drill does:
#   1. Captures baseline: per-region request distribution, total request
#      rate, success rate.
#   2. Blackholes the target region's egress (route table: 0.0.0.0/0 →
#      blackhole).
#   3. Polls the load balancer's healthy-host count; asserts it stabilises
#      to the surviving regions.
#   4. Captures request success rate during the partition; asserts no
#      user-visible 5xx spike.
#   5. Restores the route table.
#
# Why a separate drill:
#   - DNS-based failover is async; depends on client TTLs.
#   - The real measure is end-to-end: a user in the blackholed region
#     should land on the nearest surviving region within 30 s.
#
# Out of scope here (P22b):
#   - Multi-region writer failover (today: read-only survivability in
#     the partition; full HA lands in P22b).
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
    key            = "infra/chaos/region-isolation/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "domio-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "Primary region (where the drill runner lives)."
  type        = string
  default     = "us-east-1"
}

variable "drill_enabled" {
  type    = bool
  default = false
}

variable "blackhole_region" {
  description = "Region to isolate. The drill's runner is in `aws_region`; this is the OTHER region."
  type        = string
  default     = "eu-west-1"
}

variable "blackhole_route_table_id" {
  description = "Route table ID for the blackholed region's egress (e.g., the public subnet's route table)."
  type        = string
}

variable "blackhole_duration_seconds" {
  description = "How long to hold the partition."
  type        = number
  default     = 90
}

variable "traffic_shift_budget_seconds" {
  description = "Maximum acceptable time for traffic to shift to surviving regions."
  type        = number
  default     = 30
}

variable "data_loss_budget_bytes" {
  description = "Maximum acceptable in-flight data loss during the shift. 0 means strict; > 0 tolerates in-flight."
  type        = number
  default     = 0
}

# ── IAM ─────────────────────────────────────────────────────────────────

resource "aws_iam_role" "drill_runner" {
  name = "domio-chaos-region-isolation-runner"

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
  name = "region-isolation-drill"
  role = aws_iam_role.drill_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeRouteTables",
          "ec2:ReplaceRoute",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
        ]
        Resource = "arn:aws:ec2:${var.aws_region}:*:route-table/${var.blackhole_route_table_id}"
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

resource "aws_cloudwatch_metric_alarm" "drill_shift_breach" {
  alarm_name          = "chaos-region-isolation-shift-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "region_isolation_shift_seconds"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.traffic_shift_budget_seconds
  alarm_description   = "Regional isolation drill exceeded traffic-shift budget"

  dimensions = {
    Drill = "region-isolation"
  }
}

output "drill_runner_role_arn" {
  value = aws_iam_role.drill_runner.arn
}

output "traffic_shift_budget_seconds" {
  value = var.traffic_shift_budget_seconds
}

output "data_loss_budget_bytes" {
  value = var.data_loss_budget_bytes
}