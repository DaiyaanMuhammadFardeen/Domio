variable "name" {
  description = "Logical name of the network (e.g. domio-dev-vnet)."
  type        = string

  validation {
    condition     = length(var.name) > 0 && length(var.name) <= 64
    error_message = "name must be 1-64 characters."
  }
}

variable "environment" {
  description = "Environment label (dev|staging|prod)."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of dev, staging, prod."
  }
}

variable "cidr_block" {
  description = "Primary CIDR block for the network."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.cidr_block))
    error_message = "cidr_block must be a valid CIDR."
  }
}

variable "subnet_cidrs" {
  description = "List of subnet CIDR blocks. Must contain at least 2 entries."
  type        = list(string)

  validation {
    condition     = length(var.subnet_cidrs) >= 2
    error_message = "subnet_cidrs must contain at least 2 subnets."
  }
}

variable "region" {
  description = "Region label (e.g. southeastasia). Used for tagging only."
  type        = string
  default     = "southeastasia"
}

variable "tags" {
  description = "Additional tags to apply to network resources."
  type        = map(string)
  default     = {}
}