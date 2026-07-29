variable "name" {
  description = "Postgres instance name."
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

variable "postgres_version" {
  description = "Major Postgres version."
  type        = number
  default     = 16

  validation {
    condition     = var.postgres_version >= 14 && var.postgres_version <= 17
    error_message = "postgres_version must be 14-17."
  }
}

variable "instance_size" {
  description = "Instance SKU/size (vendor-neutral)."
  type        = string
  default     = "small"

  validation {
    condition     = contains(["small", "medium", "large", "xlarge"], var.instance_size)
    error_message = "instance_size must be small|medium|large|xlarge."
  }
}

variable "storage_gb" {
  description = "Storage size in GiB."
  type        = number
  default     = 32

  validation {
    condition     = var.storage_gb >= 10 && var.storage_gb <= 16384
    error_message = "storage_gb must be between 10 and 16384."
  }
}

variable "high_availability" {
  description = "Enable HA replicas."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Backup retention in days."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "backup_retention_days must be 1-365."
  }
}

variable "databases" {
  description = "Database names to create."
  type        = list(string)
  default     = ["domio"]

  validation {
    condition     = length(var.databases) >= 1
    error_message = "databases must contain at least one entry."
  }
}