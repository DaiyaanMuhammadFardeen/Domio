locals {
  ha_replica_count = var.high_availability ? 2 : 0
  effective_size   = var.environment == "prod" ? "xlarge" : var.environment == "staging" ? "large" : var.instance_size
}

resource "null_resource" "primary" {
  triggers = {
    name             = var.name
    environment      = var.environment
    postgres_version = var.postgres_version
    instance_size    = local.effective_size
    storage_gb       = var.storage_gb
    backup_retention = var.backup_retention_days
  }
}

resource "null_resource" "replica" {
  count = local.ha_replica_count

  triggers = {
    primary_id = null_resource.primary.id
    index      = count.index
  }
}

resource "null_resource" "database" {
  count = length(var.databases)

  triggers = {
    primary_id = null_resource.primary.id
    db_name    = var.databases[count.index]
    index      = count.index
  }
}

resource "random_password" "admin" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}