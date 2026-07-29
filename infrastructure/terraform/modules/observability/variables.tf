variable "name" {
  description = "Observability stack name."
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

variable "otel_collector_replicas" {
  description = "OTel collector replica count."
  type        = number
  default     = 1

  validation {
    condition     = var.otel_collector_replicas >= 1 && var.otel_collector_replicas <= 10
    error_message = "otel_collector_replicas must be 1-10."
  }
}

variable "prometheus_retention_days" {
  description = "Prometheus retention in days."
  type        = number
  default     = 15

  validation {
    condition     = var.prometheus_retention_days >= 1 && var.prometheus_retention_days <= 365
    error_message = "prometheus_retention_days must be 1-365."
  }
}

variable "loki_retention_days" {
  description = "Loki retention in days."
  type        = number
  default     = 14

  validation {
    condition     = var.loki_retention_days >= 1 && var.loki_retention_days <= 90
    error_message = "loki_retention_days must be 1-90."
  }
}

variable "tempo_retention_days" {
  description = "Tempo retention in days."
  type        = number
  default     = 14

  validation {
    condition     = var.tempo_retention_days >= 1 && var.tempo_retention_days <= 90
    error_message = "tempo_retention_days must be 1-90."
  }
}

variable "grafana_admin_user" {
  description = "Grafana admin user."
  type        = string
  default     = "admin"

  validation {
    condition     = length(var.grafana_admin_user) >= 1
    error_message = "grafana_admin_user must be set."
  }
}

variable "self_hosted_grafana" {
  description = "Use self-hosted Grafana (vendor-neutral default)."
  type        = bool
  default     = true
}

variable "slo_alerts_enabled" {
  description = "Enable SLO burn-rate alerts."
  type        = bool
  default     = true
}