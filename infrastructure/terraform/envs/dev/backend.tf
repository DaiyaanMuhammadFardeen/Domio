# Backend is partial — credentials are provided per-environment.
# This skeleton is documented in docs/runbooks/environments.md and the CI plan-baseline spec
# runs `terraform init -backend=false` so no live bucket is required.
terraform {
  backend "s3" {
    # bucket         = "domio-tfstate-dev"
    # key            = "infrastructure/terraform/dev.tfstate"
    # region         = "southeastasia"
    # dynamodb_table = "domio-tf-locks"
    # encrypt        = true
  }
}