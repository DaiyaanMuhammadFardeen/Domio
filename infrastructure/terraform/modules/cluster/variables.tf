variable "name" {
  description = "Cluster name."
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

variable "kubernetes_version" {
  description = "Kubernetes version, semver-like (e.g. 1.30.x)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+", var.kubernetes_version))
    error_message = "kubernetes_version must be a semver string."
  }
}

variable "node_count_min" {
  description = "Minimum node count for autoscaling."
  type        = number
  default     = 1

  validation {
    condition     = var.node_count_min >= 1 && var.node_count_min <= 100
    error_message = "node_count_min must be between 1 and 100."
  }
}

variable "node_count_max" {
  description = "Maximum node count for autoscaling."
  type        = number
  default     = 3

  validation {
    condition     = var.node_count_max >= var.node_count_min && var.node_count_max <= 1000
    error_message = "node_count_max must be >= node_count_min and <= 1000."
  }
}

variable "vm_size" {
  description = "VM SKU/size (e.g. Standard_D2s_v5). Default AKS-leaning."
  type        = string
  default     = "Standard_D2s_v5"
}

variable "gitops_repo_url" {
  description = "GitOps repo URL — consumed by cluster bootstrap."
  type        = string
  default     = ""

  validation {
    condition     = var.gitops_repo_url == "" || can(regex("^(https?://|git@)", var.gitops_repo_url))
    error_message = "gitops_repo_url must start with http(s):// or git@ when set."
  }
}

variable "argocd_namespace" {
  description = "Namespace for ArgoCD."
  type        = string
  default     = "argocd"
}

variable "tags" {
  description = "Additional tags."
  type        = map(string)
  default     = {}
}