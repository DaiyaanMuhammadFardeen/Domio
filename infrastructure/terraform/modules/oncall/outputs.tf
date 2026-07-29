output "service_id" {
  description = "On-call service identifier."
  value       = null_resource.service.id
}

output "escalation_policy_id" {
  description = "Escalation policy identifier."
  value       = var.escalation_policy_enabled ? null_resource.escalation_policy[0].id : ""
}

output "rotation_id" {
  description = "Rotation identifier."
  value       = null_resource.rotation.id
}

output "provider_vendor" {
  description = "Selected vendor."
  value       = var.provider_vendor
}