output "vault_ids" {
  description = "Vault server identifiers."
  value       = null_resource.vault[*].id
}

output "kv_mount_ids" {
  description = "KV mount identifiers."
  value       = null_resource.kv_mount[*].id
}

output "vault_endpoint" {
  description = "Vault server endpoint."
  value       = "${var.name}.${var.environment}.svc.cluster.local:8200"
}

output "dev_mode_enabled" {
  description = "Whether Vault dev mode is enabled."
  value       = var.dev_mode
}

output "external_secrets_path_prefix" {
  description = "Recommended ExternalSecret store reference."
  value       = "vault://${var.environment}"
}

output "root_token_id" {
  description = "Generated dev root token id (placeholder; sensitive)."
  value       = random_id.root_token.hex
  sensitive   = true
}