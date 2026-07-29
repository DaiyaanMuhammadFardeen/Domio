terraform {
  required_version = ">= 1.9.0"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = ">= 3.2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6.0"
    }
  }
}

provider "null" {}

provider "random" {}

locals {
  common_tags = {
    project     = "domio"
    environment = "dev"
    cost-center = "platform"
    managed-by  = "terraform"
  }

  env_sizing = {
    postgres_storage_gb   = 64
    nats_replicas          = 1
    minio_replicas         = 2
    valkey_mode            = "standalone"
    observability_replicas = 1
    vault_replicas         = 1
    cluster_node_min       = 1
    cluster_node_max       = 3
  }
}

module "network" {
  source = "../../modules/network"

  name        = "${var.cluster_name}-vnet"
  environment = "dev"
  region      = var.region
  cidr_block  = "10.10.0.0/16"
  subnet_cidrs = [
    "10.10.0.0/22",
    "10.10.4.0/22",
  ]
  tags = local.common_tags
}

module "cluster" {
  source = "../../modules/cluster"

  name               = var.cluster_name
  environment        = "dev"
  kubernetes_version = var.kubernetes_version
  vm_size            = "Standard_B2s"
  node_count_min     = local.env_sizing.cluster_node_min
  node_count_max     = local.env_sizing.cluster_node_max
  gitops_repo_url    = var.gitops_repo_url
  argocd_namespace   = var.argocd_namespace
  tags               = local.common_tags

  depends_on = [module.network]
}

module "postgres" {
  source = "../../modules/postgres"

  name                 = "${var.cluster_name}-pg"
  environment          = "dev"
  postgres_version     = 16
  instance_size        = "small"
  storage_gb           = local.env_sizing.postgres_storage_gb
  high_availability    = false
  backup_retention_days = 7
  databases            = ["domio"]
}

module "nats" {
  source = "../../modules/nats"

  name              = "${var.cluster_name}-nats"
  environment       = "dev"
  replicas          = local.env_sizing.nats_replicas
  jetstream_enabled = true
  storage_gb        = 10
}

module "minio" {
  source = "../../modules/minio"

  name                = "${var.cluster_name}-minio"
  environment         = "dev"
  buckets             = ["domio-assets", "domio-attachments", "domio-snapshots"]
  replicas            = local.env_sizing.minio_replicas
  storage_per_node_gb = 200
}

module "valkey" {
  source = "../../modules/valkey"

  name        = "${var.cluster_name}-valkey"
  environment = "dev"
  mode        = local.env_sizing.valkey_mode
  shards      = 1
  memory_gb   = 2
  tls_enabled = false
}

module "observability" {
  source = "../../modules/observability"

  name                       = "${var.cluster_name}-obs"
  environment                = "dev"
  otel_collector_replicas    = local.env_sizing.observability_replicas
  prometheus_retention_days  = 7
  loki_retention_days        = 7
  tempo_retention_days       = 7
  self_hosted_grafana        = true
  slo_alerts_enabled         = true
}

module "vault" {
  source = "../../modules/vault"

  name                    = "${var.cluster_name}-vault"
  environment             = "dev"
  dev_mode                = var.vault_dev_mode
  replicas                = local.env_sizing.vault_replicas
  kv_version              = 2
  audit_log_enabled       = true
  external_secrets_namespace = "external-secrets"
  secret_paths = [
    "secret/dev/",
  ]
}

module "oncall" {
  source = "../../modules/oncall"

  service_name             = "domio-dev-platform"
  environment              = "dev"
  provider_vendor          = "pagerduty"
  escalation_policy_enabled = true
  primary_team             = "domio-platform"
  secondary_team           = "domio-security"
}