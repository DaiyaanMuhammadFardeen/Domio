output "cluster_id" {
  description = "Cluster identifier."
  value       = null_resource.cluster.id
}

output "kube_id" {
  description = "Random suffix appended to cluster resources."
  value       = random_id.kube_id.hex
  sensitive   = true
}

output "node_pool_ids" {
  description = "Node pool identifiers."
  value       = null_resource.node_pool[*].id
}

output "gitops_bootstrap_applied" {
  description = "Whether the gitops bootstrap was triggered."
  value       = length(null_resource.gitops_bootstrap) > 0
}