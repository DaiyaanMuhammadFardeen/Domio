output "network_id" {
  description = "Opaque identifier of the network."
  value       = null_resource.network.id
}

output "subnet_ids" {
  description = "List of subnet identifiers in declaration order."
  value       = null_resource.subnet[*].id
}

output "summary_path" {
  description = "Path to the generated summary JSON (local-only artifact)."
  value       = local_file.network_summary.filename
}