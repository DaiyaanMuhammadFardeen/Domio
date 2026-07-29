terraform {
  backend "s3" {
    # bucket         = "domio-tfstate-staging"
    # key            = "infrastructure/terraform/staging.tfstate"
    # region         = "southeastasia"
    # dynamodb_table = "domio-tf-locks"
    # encrypt        = true
  }
}