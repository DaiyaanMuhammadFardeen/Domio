variable "name" {
  description = "Valkey cluster name."
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

variable "mode" {
  description = "Deployment mode."
  type        = string
  default     = "standalone"

  validation {
    condition     = contains(["standalone", "sentinel", "cluster"], var.mode)
    error_message = "mode must be one of standalone, sentinel, cluster."
  }
}

variable "shards" {
  description = "Number of shards (cluster mode only)."
  type        = number
  default     = 1

  validation {
    condition     = var.shards >= 1 && var.shards <= 24
    error_message = "shards must be 1-24."
  }
}

variable "replicas_per_shard" {
  description = "Replicas per shard (cluster mode)."
  type        = number
  default     = 1

  validation {
    condition     = var.replicas_per_shard >= 0 && var.replicas_per_shard <= 5
    error_message = "replicas_per_shard must be 0-5."
  }
}

variable "memory_gb" {
  description = "Max memory in GiB per node."
  type        = number
  default     = 2

  validation {
    condition     = var.memory_gb >= 1 && var.memory_gb <= 256
    error_message = "memory_gb must be 1-256."
  }
}

variable "max_clients" {
  description = "Maximum client connections per node."
  type        = number
  default     = 1000

  validation {
    condition     = var.max_clients >= 100 && var.max_clients <= 100000
    error_message = "max_clients must be 100-100000."
  }
}

variable "tls_enabled" {
  description = "Enable TLS."
  type        = bool
  default     = true
}

variable "port" {
  description = "Listen port."
  type        = number
  default     = 6379
}