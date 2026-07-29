terraform {
  backend "s3" {
    # bucket         = "domio-tfstate-prod"
    # key            = "infrastructure/terraform/prod.tfstate"
    # region         = "southeastasia"
    # dynamodb_table = "domio-tf-locks"
    # encrypt        = true
  }
}