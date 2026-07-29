resource "null_resource" "otel_collector" {
  count = var.otel_collector_replicas

  triggers = {
    stack_name   = var.name
    environment  = var.environment
    index        = count.index
    slo_alerts   = var.slo_alerts_enabled
  }
}

resource "null_resource" "prometheus" {
  triggers = {
    stack_name         = var.name
    retention_days     = var.prometheus_retention_days
    environment        = var.environment
    slo_alerts_enabled = var.slo_alerts_enabled
  }
}

resource "null_resource" "loki" {
  triggers = {
    stack_name     = var.name
    retention_days = var.loki_retention_days
    environment    = var.environment
  }
}

resource "null_resource" "tempo" {
  triggers = {
    stack_name     = var.name
    retention_days = var.tempo_retention_days
    environment    = var.environment
  }
}

resource "null_resource" "grafana" {
  count = var.self_hosted_grafana ? 1 : 0

  triggers = {
    stack_name = var.name
    environment = var.environment
    admin_user = var.grafana_admin_user
  }
}