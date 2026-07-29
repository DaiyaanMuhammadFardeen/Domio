resource "null_resource" "service" {
  triggers = {
    service_name     = var.service_name
    environment      = var.environment
    provider_vendor  = var.provider_vendor
    notify_channel   = var.notify_channel
  }
}

resource "null_resource" "escalation_policy" {
  count = var.escalation_policy_enabled ? 1 : 0

  triggers = {
    service_id     = null_resource.service.id
    primary_team   = var.primary_team
    secondary_team = var.secondary_team
    levels_json    = jsonencode([
      { level = 1, team = var.primary_team,   delay_minutes = 5 },
      { level = 2, team = var.secondary_team, delay_minutes = 10 },
      { level = 3, team = "domio-management", delay_minutes = 15 },
    ])
  }
}

resource "null_resource" "rotation" {
  triggers = {
    service_id   = null_resource.service.id
    schedule     = "weekly-monday-00:00-BDT"
    primary_team = var.primary_team
  }
}