resource "null_resource" "node" {
  count = var.replicas

  triggers = {
    tenant             = var.name
    environment        = var.environment
    storage_per_node_gb = var.storage_per_node_gb
    index              = count.index
    role               = count.index < var.replicas / 2 ? "primary" : "secondary"
  }
}

resource "null_resource" "bucket" {
  count = length(var.buckets)

  triggers = {
    tenant_id   = var.name
    bucket_name = var.buckets[count.index]
    index       = count.index
  }
}

resource "random_password" "root_password" {
  length           = 32
  special          = false
  override_special = ""
}