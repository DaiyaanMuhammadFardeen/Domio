output "otel_collector_ids" {
  description = "OTel collector replica identifiers."
  value       = null_resource.otel_collector[*].id
}

output "prometheus_id" {
  description = "Prometheus resource identifier."
  value       = null_resource.prometheus.id
}

output "loki_id" {
  description = "Loki resource identifier."
  value       = null_resource.loki.id
}

output "tempo_id" {
  description = "Tempo resource identifier."
  value       = null_resource.tempo.id
}

output "grafana_id" {
  description = "Grafana resource identifier (empty when not self-hosted)."
  value       = var.self_hosted_grafana ? null_resource.grafana[0].id : ""
}

output "grafana_endpoint" {
  description = "Grafana endpoint."
  value       = "${var.name}-grafana.${var.environment}.svc.cluster.local:3000"
}