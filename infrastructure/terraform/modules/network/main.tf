resource "null_resource" "network" {
  triggers = {
    name         = var.name
    cidr_block   = var.cidr_block
    subnets      = join(",", var.subnet_cidrs)
    environment  = var.environment
    region       = var.region
    tags_sha     = sha256(jsonencode(var.tags))
  }
}

resource "null_resource" "subnet" {
  count = length(var.subnet_cidrs)

  triggers = {
    network_id   = null_resource.network.id
    cidr         = var.subnet_cidrs[count.index]
    index        = count.index
    environment  = var.environment
  }
}

resource "local_file" "network_summary" {
  filename = "${path.module}/.summary/${var.name}.json"
  content = jsonencode({
    name        = var.name
    environment = var.environment
    region      = var.region
    cidr_block  = var.cidr_block
    subnets = [
      for idx, cidr in var.subnet_cidrs : {
        index = idx
        cidr  = cidr
        role  = idx == 0 ? "control-plane" : "data-plane"
      }
    ]
    tags        = var.tags
    generated_at = timestamp()
  })

  lifecycle {
    ignore_changes = [content]
  }
}