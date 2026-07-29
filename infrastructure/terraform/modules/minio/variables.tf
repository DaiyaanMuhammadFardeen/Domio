variable "name" {
  description = "MinIO tenant name."
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

variable "buckets" {
  description = "List of buckets to provision."
  type        = list(string)
  default     = ["domio-assets", "domio-attachments", "domio-snapshots"]

  validation {
    condition     = length(var.buckets) >= 1
    error_message = "buckets must contain at least one entry."
  }

  validation {
    condition     = alltrue([for b in var.buckets : can(regex("^[a-z0-9][a-z0-9-]{1,62}$", b))])
    error_message = "Each bucket name must match ^[a-z0-9][a-z0-9-]{1,62}$."
  }
}

variable "replicas" {
  description = "MinIO server replica count (must be even)."
  type        = number
  default     = 2

  validation {
    condition     = var.replicas >= 1 && var.replicas <= 16 && var.replicas % 2 == 0
    error_message = "replicas must be an even number between 1 and 16."
  }
}

variable "storage_per_node_gb" {
  description = "Storage per server node in GiB."
  type        = number
  default     = 100

  validation {
    condition     = var.storage_per_node_gb >= 10 && var.storage_per_node_gb <= 16384
    error_message = "storage_per_node_gb must be 10-16384."
  }
}

variable "root_user" {
  description = "Root user identifier (placeholder; secret must come from external backend)."
  type        = string
  default     = "domio-admin"

  validation {
    condition     = length(var.root_user) >= 3 && length(var.root_user) <= 32
    error_message = "root_user length must be 3-32."
  }
}