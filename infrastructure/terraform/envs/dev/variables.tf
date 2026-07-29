variable "region" {
  description = "Region label (vendor-neutral)."
  type        = string
  default     = "southeastasia"
}

variable "cluster_name" {
  description = "Cluster name."
  type        = string
  default     = "domio-dev"
}

variable "kubernetes_version" {
  description = "Kubernetes version."
  type        = string
  default     = "1.30.4"
}

variable "gitops_repo_url" {
  description = "GitOps repo URL."
  type        = string
  default     = "https://github.com/domio/infrastructure"
}

variable "vault_dev_mode" {
  description = "Enable Vault dev mode for dev environment."
  type        = bool
  default     = true
}

variable "argocd_namespace" {
  description = "ArgoCD namespace."
  type        = string
  default     = "argocd"
}

variable "image_registry" {
  description = "Container image registry (default GHCR)."
  type        = string
  default     = "ghcr.io/domio"
}