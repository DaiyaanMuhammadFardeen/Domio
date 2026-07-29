resource "null_resource" "vault" {
  count = var.replicas

  triggers = {
    name             = var.name
    environment      = var.environment
    dev_mode         = var.dev_mode
    kv_version       = var.kv_version
    audit_log        = var.audit_log_enabled
    external_secrets = var.external_secrets_namespace
    index            = count.index
    role             = count.index == 0 ? "active" : "standby"
  }
}

resource "null_resource" "kv_mount" {
  count = length(var.secret_paths)

  triggers = {
    cluster_id   = var.name
    kv_version   = var.kv_version
    path         = var.secret_paths[count.index]
    index        = count.index
  }
}

resource "random_id" "root_token" {
  byte_length = 32
}