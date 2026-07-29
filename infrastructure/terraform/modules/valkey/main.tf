locals {
  total_nodes = var.mode == "cluster" ? var.shards * (var.replicas_per_shard + 1) : var.shards
}

resource "null_resource" "shard" {
  count = var.mode == "cluster" ? var.shards : 1

  triggers = {
    name           = var.name
    environment    = var.environment
    mode           = var.mode
    memory_gb      = var.memory_gb
    tls_enabled    = var.tls_enabled
    port           = var.port
    index          = count.index
  }
}

resource "null_resource" "node" {
  count = local.total_nodes

  triggers = {
    name           = var.name
    environment    = var.environment
    mode           = var.mode
    shard_index    = var.mode == "cluster" ? count.index % var.shards : 0
    replica_index  = var.mode == "cluster" ? count.index / var.shards : 0
    tls_enabled    = var.tls_enabled
    port           = var.port
  }
}