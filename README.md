# Ledger

Personal finance app. Dark-mode-only, ledger-style UI backed by a Quarkus API on Kubernetes.

```
ledger-finance/
├── backend/     Quarkus (Java 21, Maven) — REST API, Postgres, JWT auth, Flyway
├── frontend/    React (Vite) — SPA, served via Nginx in prod
└── terraform/   Kubernetes manifests (Terraform) — deployed to VPS via GitHub Actions
```

## Running locally

**Recommended: Docker Compose**
```bash
docker compose up
```
- Backend: `http://localhost:8080` (Quarkus dev mode, live-reload enabled)
- Frontend: `http://localhost:5173`
- DB: `localhost:5432` (postgres/ledger/ledger)

> Warning: editing any `.java` file triggers Hibernate `drop-and-create` in dev mode — local data is wiped on every live-reload. Expected behavior until Flyway is wired for dev.

**Manual:**
```bash
# Backend
cd backend && ./mvnw quarkus:dev     # localhost:8080

# Frontend
cd frontend && npm install && npm run dev   # localhost:5173
```

## Seed data

```bash
# After backend has created the schema at least once:
psql -h localhost -U ledger -d ledger -f backend/seed-data.sql
# Login: demo@ledger.app / demo12345
```

> Known bug: the demo password hash uses `$2b$` prefix — Quarkus Elytron's `BcryptUtil` expects `$2a$`. Demo login is currently broken.

## Feature status

All pages are fully wired end-to-end:

| Page | Route | Status |
|------|-------|--------|
| Overview | `/` | Done — balance, recent transactions, budget spend panel, date-range dropdown |
| Transactions | `/transactions` | Done — list, add, edit, delete, account/category/date filters, CSV export |
| Accounts | `/accounts` | Done — list, add, edit, delete (with FK pre-check) |
| Budgets | `/budgets` | Done — list, add, edit, delete, month navigation, spend progress bars |
| Categories | `/categories` | Done — list, add, edit, delete (blocked if in use) |
| Credit Cards | `/credit-cards` | Done — glance dashboard: total owed/limit/available, utilization bars, due dates |
| Profile | `/profile` | Done — edit display name/email, change password, account history log |

## Architecture

- **Auth:** JWT (SmallRye JWT), 7-day bearer tokens, no refresh flow. BCrypt via `BcryptUtil` (`$2a$` prefix).
- **Migrations:** Flyway active in prod (`V1__init_schema.sql`). Dev uses `drop-and-create`.
- **Budget spend:** computed live from transactions (`GET /budgets/month/{yyyy-MM}/spend`), not stored.
- **Balance math:** `Account.openingBalance` (immutable) + chronological walk of transactions via `recomputeAccountBalance()` — no insertion-order math.
- **Transactions with repeat/installments:** pre-generated as flat rows at create time; `seriesInfo` is display-only (no `series_id` group column yet).

## Deployment

GitHub Actions → Docker Hub → Terraform apply to Kubernetes (self-hosted VPS).

- CI runners: `graalvm-25` (backend), `easynode-debian` (frontend + deploy)
- Secrets managed via **Doppler** (`prd` config)
- Docker images: `rmcampos/ledger-backend`, `rmcampos/ledger-frontend`
- Versioning: `vYYYY.MM.DD.<run_number>` for backend; `latest` for frontend
- Prod URLs:
  - Frontend: `https://ledger-finance.darkroasted.vps-kinghost.net`
  - Backend API: `https://ledgerapi.darkroasted.vps-kinghost.net`
- Terraform state: Cloudflare R2 bucket `ledger-finance`
- DB backups: Kubernetes CronJob → R2 bucket `ledger-finance-backups` (twice daily, 00:00 and 12:00 UTC)

## Known gaps

- Demo login broken (`$2b$` bcrypt prefix in seed-data.sql)
- No refresh tokens — re-login after 7 days
- No date-range query params on `GET /transactions/account/{id}` — filtering is client-side
- No `series_id` on Transaction — repeat/installment occurrences share only a cosmetic `seriesInfo` string; no bulk edit/delete
- No dashboard aggregation endpoint — Overview computes totals client-side
