variable "name" {
  description = "NATS cluster name."
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

variable "replicas" {
  description = "NATS cluster replica count."
  type        = number
  default     = 1

  validation {
    condition     = var.replicas >= 1 && var.replicas <= 9
    error_message = "replicas must be 1-9."
  }
}

variable "jetstream_enabled" {
  description = "Enable JetStream persistence."
  type        = bool
  default     = true
}

variable "storage_gb" {
  description = "Storage in GiB for JetStream."
  type        = number
  default     = 10

  validation {
    condition     = var.storage_gb >= 1 && var.storage_gb <= 4096
    error_message = "storage_gb must be 1-4096."
  }
}

variable "max_payload_mb" {
  description = "Maximum message payload in MB."
  type        = number
  default     = 4

  validation {
    condition     = var.max_payload_mb >= 1 && var.max_payload_mb <= 64
    error_message = "max_payload_mb must be 1-64."
  }
}

variable "client_port" {
  description = "Client listen port."
  type        = number
  default     = 4222
}

variable "cluster_port" {
  description = "Cluster listen port."
  type        = number
  default     = 6222
}

variable "monitor_port" {
  description = "HTTP monitor port."
  type        = number
  default     = 8222
}