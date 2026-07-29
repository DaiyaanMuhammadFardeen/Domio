variable "region" {
  description = "Region label."
  type        = string
  default     = "southeastasia"
}

variable "cluster_name" {
  description = "Cluster name (must be the agreed prod name)."
  type        = string
  default     = "domio-prod"
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
  description = "Enable Vault dev mode (must remain false in prod)."
  type        = bool
  default     = false
}

variable "vault_enabled" {
  description = "Whether prod runs Vault. Skips in environments that don't run Vault."
  type        = bool
  default     = false
}

variable "argocd_namespace" {
  description = "ArgoCD namespace."
  type        = string
  default     = "argocd"
}

variable "image_registry" {
  description = "Container image registry."
  type        = string
  default     = "ghcr.io/domio"
}

variable "prod_data_residency_region" {
  description = "Data residency pin for prod (Bangladesh).
    Hard-coded unless overridden by terraform.tfvars."
  type        = string
  default     = "southeastasia"
}