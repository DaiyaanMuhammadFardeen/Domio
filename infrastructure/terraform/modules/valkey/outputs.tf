output "shard_ids" {
  description = "Shard identifiers."
  value       = null_resource.shard[*].id
}

output "node_ids" {
  description = "Node identifiers."
  value       = null_resource.node[*].id
}

output "total_nodes" {
  description = "Total node count."
  value       = local.total_nodes
}

output "endpoint" {
  description = "Primary endpoint."
  value       = "${var.name}.${var.environment}.svc.cluster.local:${var.port}"
}