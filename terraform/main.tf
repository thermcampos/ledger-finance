terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.0.0"
    }
  }

  backend "s3" {
    bucket                      = "ledger-finance"
    key                         = "kubernetes/terraform.tfstate"
    region                      = "auto"
    endpoints                   = { s3 = "https://d17eb09b6bce2f90e16e800bb2a6baf9.r2.cloudflarestorage.com" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

variable "db_user" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_name" {
  type      = string
  sensitive = true
}

variable "r2_access_key" {
  type      = string
  sensitive = true
}

variable "r2_secret_key" {
  type      = string
  sensitive = true
}

variable "r2_bucket_name" {
  type    = string
  default = "ledger-finance-backups"
}

variable "r2_endpoint" {
  type    = string
  default = "https://d17eb09b6bce2f90e16e800bb2a6baf9.r2.cloudflarestorage.com"
}

variable "backend_image" {
  type    = string
  default = "docker.io/rmcampos/ledger-backend:v2026.07.07.9"
}

variable "frontend_image" {
  type    = string
  default = "docker.io/rmcampos/ledger-frontend:latest"
}

resource "kubernetes_namespace_v1" "ledger_finance" {
  metadata {
    name = "ledger-finance"
  }
}

resource "kubernetes_secret_v1" "ledger_finance_secrets" {
  metadata {
    name      = "ledger-finance-secrets"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }

  data = {
    postgres_user       = var.db_user
    postgres_password   = var.db_password
    postgres_db         = var.db_name
  }
}

resource "kubernetes_persistent_volume_claim_v1" "ledger_finance_db_data" {
  metadata {
    name      = "postgres-data-pvc"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "1Gi"
      }
    }
  }
}

resource "kubernetes_deployment_v1" "ledger_finance_db" {
  metadata {
    name      = "ledger-finance-db"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    replicas = 1
    selector { match_labels = { app = "ledger-finance-db" } }
    template {
      metadata { labels = { app = "ledger-finance-db" } }
      spec {
        container {
          image = "postgres:16"
          name  = "postgres"
          volume_mount {
            name       = "postgres-storage"
            mount_path = "/var/lib/postgresql/data"
          }
          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                key  = "postgres_user"
              }
            }
          }
          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                key  = "postgres_password"
              }
            }
          }
          env {
            name = "POSTGRES_DB"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                key  = "postgres_db"
              }
            }
          }
          port { container_port = 5432 }
        }
        volume {
          name = "postgres-storage"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.ledger_finance_db_data.metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "ledger_finance_db_svc" {
  metadata {
    name      = "ledger-finance-db-svc"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    selector = { app = "ledger-finance-db" }
    port { port = 5432 }
    type = "ClusterIP"
  }
}

resource "kubernetes_deployment_v1" "ledger_finance_backend" {
  metadata {
    name      = "ledger-finance-backend"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    replicas = 1
    selector { match_labels = { app = "ledger-finance-backend" } }
    template {
      metadata { labels = { app = "ledger-finance-backend" } }
      spec {
        container {
          image = var.backend_image
          name  = "backend"
          env {
            name  = "QUARKUS_PROFILE"
            value = "prod"
          }
          env {
            name  = "POSTGRES_DB"
            value = var.db_name
          }
          env {
            name  = "POSTGRES_HOST"
            value = "ledger-finance-db-svc"
          }
          env {
            name  = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                key  = "postgres_user"
              }
            }
          }
          env {
            name  = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                key  = "postgres_password"
              }
            }
          }
          resources {
            limits   = { memory = "256Mi", cpu = "500m" }
            requests = { memory = "256Mi", cpu = "250m" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "ledger_finance_backend_svc" {
  metadata {
    name      = "ledger-finance-backend-svc"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    selector = { app = "ledger-finance-backend" }
    port {
      port        = 8080
      target_port = 8080
    }
  }
}

resource "kubernetes_deployment_v1" "ledger_finance_frontend" {
  metadata {
    name      = "ledger-finance-frontend"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    replicas = 1
    selector { match_labels = { app = "ledger-finance-frontend" } }
    template {
      metadata { labels = { app = "ledger-finance-frontend" } }
      spec {
        container {
          image = var.frontend_image
          name  = "frontend"
          port { container_port = 80 }
          resources {
            limits   = { memory = "128Mi", cpu = "150m" }
            requests = { memory = "128Mi", cpu = "100m" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "ledger_finance_frontend_svc" {
  metadata {
    name      = "ledger-finance-frontend-svc"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    selector = { app = "ledger-finance-frontend" }
    port {
      port        = 80
      target_port = 80
    }
    type = "ClusterIP"
  }
}

# Unified Ingress for App and API
resource "kubernetes_ingress_v1" "ledger_finance_ingress" {
  metadata {
    name      = "ledger-finance-ingress"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.class"    = "traefik"
      "cert-manager.io/cluster-issuer" = "letsencrypt-prod"
    }
  }
  spec {
    tls {
      hosts       = ["ledger-finance.darkroasted.vps-kinghost.net", "ledgerapi.darkroasted.vps-kinghost.net"]
      secret_name = "ledger-finance-tls-certs"
    }
    rule {
      host = "ledger-finance.darkroasted.vps-kinghost.net"
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service_v1.ledger_finance_frontend_svc.metadata[0].name
              port { number = 80 }
            }
          }
        }
      }
    }
    rule {
      host = "ledgerapi.darkroasted.vps-kinghost.net"
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service_v1.ledger_finance_backend_svc.metadata[0].name
              port { number = 8080 }
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_secret_v1" "r2_backup_secrets" {
  metadata {
    name      = "r2-backup-secrets"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }

  data = {
    access_key = var.r2_access_key
    secret_key = var.r2_secret_key
  }
}

resource "kubernetes_cron_job_v1" "ledger_finance_db_backup" {
  metadata {
    name      = "ledger-finance-db-backup"
    namespace = kubernetes_namespace_v1.ledger_finance.metadata[0].name
  }
  spec {
    schedule = "0 0,12 * * *"
    job_template {
      metadata {
        labels = {
          app = "ledger-finance-db-backup"
        }
      }
      spec {
        template {
          metadata {
            labels = {
              app = "ledger-finance-db-backup"
            }
          }
          spec {
            container {
              name    = "backup"
              image   = "postgres:16-alpine"
              command = ["/bin/sh", "-c"]
              args = [
                <<-EOT
                apk add --no-cache aws-cli
                export PGPASSWORD=$POSTGRES_PASSWORD
                FILENAME="backup-$(date +%Y%m%d%H%M%S).sql.gz"
                echo "Starting backup of $POSTGRES_DB to $FILENAME..."
                pg_dump -h $DB_HOST -U $POSTGRES_USER $POSTGRES_DB | gzip > /tmp/$FILENAME
                echo "Uploading to R2..."
                AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$R2_SECRET_KEY \
                aws s3 cp /tmp/$FILENAME s3://$R2_BUCKET/ --endpoint-url $R2_ENDPOINT
                echo "Backup completed successfully."
                EOT
              ]
              env {
                name  = "DB_HOST"
                value = "ledger-finance-db-svc"
              }
              env {
                name = "POSTGRES_USER"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                    key  = "postgres_user"
                  }
                }
              }
              env {
                name = "POSTGRES_PASSWORD"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                    key  = "postgres_password"
                  }
                }
              }
              env {
                name = "POSTGRES_DB"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.ledger_finance_secrets.metadata[0].name
                    key  = "postgres_db"
                  }
                }
              }
              env {
                name = "R2_ACCESS_KEY"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.r2_backup_secrets.metadata[0].name
                    key  = "access_key"
                  }
                }
              }
              env {
                name = "R2_SECRET_KEY"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.r2_backup_secrets.metadata[0].name
                    key  = "secret_key"
                  }
                }
              }
              env {
                name  = "R2_BUCKET"
                value = var.r2_bucket_name
              }
              env {
                name  = "R2_ENDPOINT"
                value = var.r2_endpoint
              }
            }
            restart_policy = "OnFailure"
          }
        }
      }
    }
  }
}
