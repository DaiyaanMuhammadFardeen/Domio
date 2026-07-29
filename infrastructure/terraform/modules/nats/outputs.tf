output "node_ids" {
  description = "NATS node resource identifiers."
  value       = null_resource.node[*].id
}

output "client_endpoint" {
  description = "Recommended client endpoint."
  value       = "${var.name}.${var.environment}.svc.cluster.local:${var.client_port}"
}

output "monitor_endpoint" {
  description = "HTTP monitor endpoint."
  value       = "${var.name}.${var.environment}.svc.cluster.local:${var.monitor_port}"
}

output "cluster_endpoints" {
  description = "Comma-separated cluster peer endpoints."
  value       = null_resource.cluster_meta.triggers.endpoints
  sensitive   = true
}