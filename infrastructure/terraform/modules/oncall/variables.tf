variable "service_name" {
  description = "Service name in the on-call provider."
  type        = string

  validation {
    condition     = length(var.service_name) > 0 && length(var.service_name) <= 64
    error_message = "service_name must be 1-64 characters."
  }
}

variable "environment" {
  description = "Environment label."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of dev, staging, prod."
  }
}

variable "provider_vendor" {
  description = "Vendor identifier; supports swap-in via wrapper modules."
  type        = string
  default     = "pagerduty"

  validation {
    condition     = contains(["pagerduty", "opsgenie", "incidentio", "none"], var.provider_vendor)
    error_message = "provider_vendor must be pagerduty|opsgenie|incidentio|none."
  }
}

variable "escalation_policy_enabled" {
  description = "Create an escalation policy skeleton."
  type        = bool
  default     = true
}

variable "primary_team" {
  description = "Primary on-call team identifier."
  type        = string
  default     = "domio-platform"
}

variable "secondary_team" {
  description = "Secondary on-call team identifier."
  type        = string
  default     = "domio-security"
}

variable "notify_channel" {
  description = "Notification channel (vendor-neutral placeholder)."
  type        = string
  default     = "#oncall-platform"
}