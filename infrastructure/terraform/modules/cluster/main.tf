resource "random_id" "kube_id" {
  byte_length = 4
}

resource "null_resource" "cluster" {
  triggers = {
    name              = var.name
    environment       = var.environment
    kubernetes_version = var.kubernetes_version
    vm_size           = var.vm_size
    node_count_min    = var.node_count_min
    node_count_max    = var.node_count_max
    gitops_repo_url   = var.gitops_repo_url
    argocd_namespace  = var.argocd_namespace
    tags_sha          = sha256(jsonencode(var.tags))
    kube_id           = random_id.kube_id.hex
  }
}

resource "null_resource" "node_pool" {
  count = var.node_count_min

  triggers = {
    cluster_id    = null_resource.cluster.id
    index         = count.index
    environment   = var.environment
  }
}

resource "null_resource" "gitops_bootstrap" {
  count = var.gitops_repo_url == "" ? 0 : 1

  triggers = {
    cluster_id        = null_resource.cluster.id
    gitops_repo_url   = var.gitops_repo_url
    argocd_namespace  = var.argocd_namespace
  }
}