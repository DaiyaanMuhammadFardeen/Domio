###############################################################################
# infra/chaos/ai_provider_fail.tf
#
# Chaos drill: AI provider failure (primary returns 5xx).
#
# Target: fallback path activates; user-visible degradation within 5 s.
#
# What the drill does:
#   1. Captures baseline AI request success rate + p95 latency.
#   2. Routes the AI provider's DNS / SG to a Toxiproxy that returns 5xx.
#   3. Issues a synthetic AI request and times the user-visible degradation.
#   4. Asserts: degradation is reported within 5 s (i.e., the circuit
#      breaker opened quickly), no client hangs > 30 s, and the
#      fallback (cached response or "AI unavailable" message) is served.
#   5. Restores the AI provider route.
#
# Why this drill exists separately:
#   - AI provider failures are the most common 3rd-party failure mode.
#   - A 30 s hang is worse than a 5 s "AI unavailable" — the fallback
#     budget matters.
#
# Out of scope here (P22b):
#   - Multi-provider fallback routing (today: cached responses).
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
    key            = "infra/chaos/ai-provider-fail/terraform.tfstate"
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
  type    = bool
  default = false
}

variable "toxiproxy_endpoint" {
  description = "Toxiproxy endpoint used to simulate AI provider 5xx."
  type        = string
}

variable "ai_route53_zone_id" {
  description = "Route53 zone ID for the AI provider CNAME we override."
  type        = string
}

variable "degradation_budget_seconds" {
  description = "Maximum acceptable user-visible degradation time (circuit opens + fallback served)."
  type        = number
  default     = 5
}

variable "client_hang_budget_seconds" {
  description = "Maximum acceptable client hang before fallback is served."
  type        = number
  default     = 30
}

# ── IAM ─────────────────────────────────────────────────────────────────

resource "aws_iam_role" "drill_runner" {
  name = "domio-chaos-ai-provider-fail-runner"

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
  name = "ai-provider-fail-drill"
  role = aws_iam_role.drill_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "route53:ListResourceRecordSets",
          "route53:ChangeResourceRecordSets",
        ]
        Resource = "arn:aws:route53:::hostedzone/${var.ai_route53_zone_id}"
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

resource "aws_cloudwatch_metric_alarm" "drill_degradation_breach" {
  alarm_name          = "chaos-ai-provider-fail-degradation-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ai_provider_degradation_seconds"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.degradation_budget_seconds
  alarm_description   = "AI provider failure drill exceeded degradation budget"

  dimensions = {
    Drill = "ai-provider-fail"
  }
}

output "drill_runner_role_arn" {
  value = aws_iam_role.drill_runner.arn
}

output "degradation_budget_seconds" {
  value = var.degradation_budget_seconds
}

output "client_hang_budget_seconds" {
  value = var.client_hang_budget_seconds
}
