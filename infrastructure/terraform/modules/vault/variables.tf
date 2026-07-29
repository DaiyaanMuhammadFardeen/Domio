variable "name" {
  description = "Vault cluster name."
  type        = string

  validation {
    condition     = length(var.name) > 0 && length(var.name) <= 64
    error_message = "name must be 1-64 characters."
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

variable "dev_mode" {
  description = "Run Vault in dev mode (skips unseal; dev-only)."
  type        = bool
  default     = false
}

variable "replicas" {
  description = "Vault HA replica count."
  type        = number
  default     = 1

  validation {
    condition     = var.replicas >= 1 && var.replicas <= 7
    error_message = "replicas must be 1-7."
  }
}

variable "kv_version" {
  description = "K/V secrets engine version."
  type        = number
  default     = 2

  validation {
    condition     = contains([1, 2], var.kv_version)
    error_message = "kv_version must be 1 or 2."
  }
}

variable "audit_log_enabled" {
  description = "Enable Vault audit log."
  type        = bool
  default     = true
}

variable "external_secrets_namespace" {
  description = "Namespace where External Secrets Operator runs."
  type        = string
  default     = "external-secrets"
}

variable "secret_paths" {
  description = "Logical secret paths to seed (referenced by External Secrets ClusterSecretStore)."
  type        = list(string)
  default     = ["secret/dev/", "secret/staging/", "secret/prod/"]

  validation {
    condition     = length(var.secret_paths) >= 1
    error_message = "secret_paths must contain at least one path."
  }
}