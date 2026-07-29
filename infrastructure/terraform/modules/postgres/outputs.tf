output "primary_id" {
  description = "Primary instance identifier."
  value       = null_resource.primary.id
}

output "replica_ids" {
  description = "HA replica identifiers."
  value       = null_resource.replica[*].id
}

output "database_ids" {
  description = "Per-database resource identifiers."
  value       = null_resource.database[*].id
}

output "admin_password" {
  description = "Generated admin password (sensitive; placeholder for dev only)."
  value       = random_password.admin.result
  sensitive   = true
}

output "effective_size" {
  description = "Resolved instance size after environment override."
  value       = local.effective_size
}