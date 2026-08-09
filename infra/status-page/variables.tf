###############################################################################
# infra/status-page/variables.tf
###############################################################################

variable "synthetics_probe_role_name" {
  description = "IAM role name used by the multi-region synthetics probe (infra/synthetics/). It needs to read the webhook secret to authenticate status page updates."
  type        = string
  default     = "domio-synthetics-probe"
}