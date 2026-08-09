###############################################################################
# infra/chaos/cdn_outage.tf
#
# Chaos drill: CDN outage (assets unreachable).
#
# Target: client-side fallbacks serve core renders; status page incident
# opens automatically.
#
# What the drill does:
#   1. Captures baseline: which assets are served by the CDN; what
#      fallbacks exist (e.g., bundled JS shipped in the SPA shell).
#   2. Revokes the CDN origin's SG ingress for 60 seconds.
#   3. Synthetically loads the public editor from 3 regions; measures
#      core-render time.
#   4. Asserts: core renders still serve (via fallback), status page
#      transitions to "degraded" within 2 minutes.
#
# What "core renders still served" means:
#   - Editor shell loads
#   - Deck metadata loads (via API, not CDN)
#   - User can navigate the deck list
#   - Failure: cannot open a deck; status page shows "operational"
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
    key            = "infra/chaos/cdn-outage/terraform.tfstate"
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

variable "cdn_origin_security_group_id" {
  description = "SG attached to the CDN origin (S3 / ALB)."
  type        = string
}

variable "cdn_distribution_id" {
  description = "CloudFront distribution ID for the static assets."
  type        = string
}

variable "partition_duration_seconds" {
  description = "How long to blackhole CDN traffic."
  type        = number
  default     = 60
}

variable "core_render_budget_ms" {
  description = "Maximum acceptable time for a core render to complete with CDN down."
  type        = number
  default     = 5000
}

variable "status_page_propagation_budget_seconds" {
  description = "Maximum acceptable time for status.domio.app to flip to degraded."
  type        = number
  default     = 120
}

# ── IAM ─────────────────────────────────────────────────────────────────

resource "aws_iam_role" "drill_runner" {
  name = "domio-chaos-cdn-outage-runner"

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
  name = "cdn-outage-drill"
  role = aws_iam_role.drill_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudfront:GetDistribution",
          "cloudfront:UpdateDistribution",
        ]
        Resource = "arn:aws:cloudfront::*:distribution/${var.cdn_distribution_id}"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupIngress",
        ]
        Resource = "arn:aws:ec2:${var.aws_region}:*:security-group/${var.cdn_origin_security_group_id}"
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

resource "aws_cloudwatch_metric_alarm" "drill_render_breach" {
  alarm_name          = "chaos-cdn-outage-render-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "cdn_outage_render_ms"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.core_render_budget_ms
  alarm_description   = "CDN outage drill exceeded core-render budget"

  dimensions = {
    Drill = "cdn-outage"
  }
}

resource "aws_cloudwatch_metric_alarm" "drill_status_page_breach" {
  alarm_name          = "chaos-cdn-outage-statuspage-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "cdn_outage_status_page_seconds"
  namespace           = "Domio/Chaos"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.status_page_propagation_budget_seconds
  alarm_description   = "CDN outage drill exceeded status-page propagation budget"

  dimensions = {
    Drill = "cdn-outage"
  }
}

output "drill_runner_role_arn" {
  value = aws_iam_role.drill_runner.arn
}

output "core_render_budget_ms" {
  value = var.core_render_budget_ms
}

output "status_page_propagation_budget_seconds" {
  value = var.status_page_propagation_budget_seconds
}
