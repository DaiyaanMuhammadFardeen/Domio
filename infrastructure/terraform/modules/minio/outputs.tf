output "node_ids" {
  description = "MinIO node resource identifiers."
  value       = null_resource.node[*].id
}

output "bucket_ids" {
  description = "Bucket resource identifiers."
  value       = null_resource.bucket[*].id
}

output "root_user" {
  description = "Root user name (placeholder)."
  value       = var.root_user
}

output "root_password" {
  description = "Generated root password (must be replaced via external secret in prod)."
  value       = random_password.root_password.result
  sensitive   = true
}

output "console_endpoint" {
  description = "MinIO console endpoint."
  value       = "${var.name}-console.${var.environment}.svc.cluster.local:9001"
}