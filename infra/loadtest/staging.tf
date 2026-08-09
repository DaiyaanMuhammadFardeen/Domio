###############################################################################
# infra/loadtest/staging.tf
#
# Load-test staging topology. Provisions a separate EKS cluster sized
# for the design-partner scale targets in P22-beta G3.1:
#
#   - audience_50k.js    : 50k concurrent WebSockets per session
#   - editors_10k.js     : 10k concurrent CRDT sessions per deck
#   - presenter_2h.js    : 2-hour sustained presenter session
#   - decks_100k.js      : 100k decks per tenant, 5000 read RPS
#   - ingest_timeline.js : 10k events/sec into event-ingest
#
# Why a separate cluster (not just "scale up staging"):
#   - The k6 load agents themselves need ~2k VUs, which is ~4× the
#     production replica count of any given service. Co-locating on
#     staging would overshadow the production baseline.
#   - A separate cluster lets us run game-day chaos drills (G3.3–G3.7)
#     without staging / staging-load-test contention.
#
# What this file does NOT do:
#   - It does NOT provision the production cluster. That lives in
#     `infrastructure/`.
#   - It does NOT include the data plane services (realtime-gateway,
#     audience-service, etc.). Those are deployed via the standard
#     Helm chart with an override for replica count.
#
# Scaling math (target: design-partner scale, 1× headroom for chaos):
#
#   realtime-gateway: prod = 6 replicas (3 AZs × 2). Load-test = 24.
#   audience-service: prod = 4. Load-test = 16.
#   collab-service:   prod = 8. Load-test = 24.
#   presenter-session: prod = 4. Load-test = 12.
#   event-ingest:     prod = 12. Load-test = 36.
#   library-service:  prod = 6. Load-test = 18.
#
# Plus a k6 runner pool: 4 × c6i.4xlarge = 64 VUs each = 256 VUs total,
# sufficient to drive 50k audience + 10k editors concurrently.
#
# Out of scope (P22-beta):
#   - Multi-region load test (added in P22b for chaos drills G3.7)
#   - Dedicated load-test DB (we use a snapshot of staging DB,
#     reset between runs)
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
    key            = "infra/loadtest-staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "domio-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for the load-test staging cluster."
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "Name of the load-test EKS cluster."
  type        = string
  default     = "domio-loadtest-staging"
}

variable "k6_runner_desired_count" {
  description = "Number of c6i.4xlarge k6 runner instances. 4 instances ≈ 256 VUs."
  type        = number
  default     = 4
}

# ── EKS cluster ──────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  name               = var.cluster_name
  kubernetes_version = "1.30"

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  eks_managed_node_groups = {
    # The data-plane node group: services are deployed here at the
    # scaled replica count.
    dataplane = {
      instance_types = ["c6i.2xlarge"]
      desired_size   = 6
      min_size       = 3
      max_size       = 30

      labels = {
        role = "loadtest-dataplane"
      }

      tags = {
        LoadTestRole = "dataplane"
      }
    }
  }

  # Cluster access.
  enable_cluster_creator_admin_permissions = true

  tags = {
    Cluster    = var.cluster_name
    CostCenter = "loadtest"
    Phase      = "P22-beta"
  }
}

# ── k6 runner ASG ───────────────────────────────────────────────────────
#
# k6 runs as a separate node group. The CI workflow submits k6 jobs
# via the k6 cloud or via self-hosted runners; this ASG is for
# manual / game-day runs.

resource "aws_autoscaling_group" "k6_runner" {
  name                = "${var.cluster_name}-k6-runner"
  vpc_zone_identifier = var.subnet_ids
  desired_capacity    = var.k6_runner_desired_count
  min_size            = 0
  max_size            = var.k6_runner_desired_count * 2

  launch_template {
    id      = aws_launch_template.k6_runner.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.cluster_name}-k6-runner"
    propagate_at_launch = true
  }
  tag {
    key                 = "LoadTestRole"
    value               = "k6-runner"
    propagate_at_launch = true
  }
}

resource "aws_launch_template" "k6_runner" {
  name_prefix = "${var.cluster_name}-k6-"
  image_id    = data.aws_ami.ubuntu_2204.id
  instance_type = "c6i.4xlarge"

  user_data = base64encode(<<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y k6
    # Tag the instance so the k6 runner operator can find it.
    echo "DOMIO_K6_RUNNER=true" > /etc/environment
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.cluster_name}-k6-runner"
    }
  }
}

data "aws_ami" "ubuntu_2204" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

# ── Snapshot reset job for the staging DB ───────────────────────────────
#
# Between load-test runs, the staging DB is restored from a clean
# snapshot. This is what `runbooks/chaos/reset-staging.sh` triggers.

resource "aws_db_cluster_snapshot" "staging_clean" {
  db_cluster_identifier          = var.staging_db_cluster_id
  db_cluster_snapshot_identifier = "loadtest-clean-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  tags = {
    Purpose = "loadtest-reset"
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────

output "cluster_endpoint" {
  description = "Endpoint of the load-test EKS cluster."
  value       = module.eks.cluster_endpoint
}

output "k6_runner_asg_name" {
  description = "ASG hosting the k6 runner instances."
  value       = aws_autoscaling_group.k6_runner.name
}

output "staging_snapshot_arn" {
  description = "Most recent load-test-clean snapshot."
  value       = aws_db_cluster_snapshot.staging_clean.arn
}

# ── Variables not declared above (passed in from root module) ──────────

variable "vpc_id" {
  description = "VPC for the load-test cluster. Use the loadtest-staging VPC (separate from prod)."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the load-test cluster. Three private subnets across 3 AZs."
  type        = list(string)
}

variable "staging_db_cluster_id" {
  description = "Aurora / RDS cluster identifier used to seed the load-test DB."
  type        = string
  default     = "domio-staging-aurora"
}
