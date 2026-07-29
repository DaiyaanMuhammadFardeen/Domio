resource "null_resource" "node" {
  count = var.replicas

  triggers = {
    cluster_name      = var.name
    environment       = var.environment
    jetstream_enabled = var.jetstream_enabled
    storage_gb        = var.jetstream_enabled ? var.storage_gb : 0
    max_payload_mb    = var.max_payload_mb
    client_port       = var.client_port
    cluster_port      = var.cluster_port
    monitor_port      = var.monitor_port
    index             = count.index
  }
}

resource "null_resource" "cluster_meta" {
  triggers = {
    cluster_name = var.name
    environment  = var.environment
    replicas     = var.replicas
    endpoints    = join(",", [for i in range(var.replicas) : "${var.name}-${i}.${var.name}.svc.cluster.local:${var.cluster_port}"])
  }
}