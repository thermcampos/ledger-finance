# Ledger — Project Context

Personal finance app. Read this before making changes — it captures decisions made during design and architecture discussion that aren't otherwise obvious from the code.

## Design language — do not deviate without asking

- **Dark mode only.** No light theme, no toggle.
- **The "ledger" concept is the whole point.** Every monetary figure is set in monospace (IBM Plex Mono), right-aligned, tabular. This is the one non-negotiable rule — if you add a new figure anywhere (a new stat, a new card), it follows this rule too.
- **Fraunces (serif)** is reserved for the hero balance number and page titles only. Do not use it for body text or labels.
- **No charts.** Budgets and spending are shown as cards with progress bars and status words (On track / Near limit / Over budget). This was an explicit choice.
- **Palette is muted, not neon:** jade `#4FA98A` for positive, brick-red `#C75450` for negative, gold `#C9A227` reserved for "near limit" warnings only. Background is ink-navy `#0E1116`, not true black.
- **Hairline borders** (`#262C36`) do the separating — avoid drop shadows or heavy card elevation.
- Tokens live in `frontend/src/styles/tokens.scss`. If the UI and tokens disagree, fix the UI, not the tokens.

## Architecture decisions

- **Backend: Quarkus (Java 21, Maven).** Explicit choice for native-image builds via GraalVM. Don't suggest swapping to Spring Boot or Express.
- **IDENTITY, not Hibernate SEQUENCE, for entity IDs.** So plain SQL (seed scripts, manual fixes) never has to guess Hibernate's sequence names. Keep this pattern for any new entity.
- **Monorepo:** `/frontend` and `/backend` in one repo, deployed as two separate artifacts.
- **Auth:** JWT via SmallRye JWT, 7-day bearer tokens, no refresh flow. BCrypt via `quarkus-elytron-security-common`'s `BcryptUtil` (not jBCrypt, always `$2a$` prefix).
- **Budget spend is computed live** from transactions (`GET /budgets/month/{yyyy-MM}/spend`), not stored — don't add a cached "spent" column to Budget, it'll drift.
- **Balance math:** `Account.openingBalance` (immutable, set at creation) + `recomputeAccountBalance()` in `CreditCardBillSyncService` (moved out of `TransactionResource` once a second call site needed it) — re-derives `account.balance` and every `runningBalance` in chronological order (`occurredOn`, then `id`) on every create/edit/delete. Never touch insertion-order-based math.
- **Flyway:** active in prod (`%prod.quarkus.flyway.migrate-at-start=true`). Dev uses `drop-and-create`. Migrations live in `backend/src/main/resources/db/migration/`.
- **Repeat/installments:** pre-generated as flat `Transaction` rows at create time (no scheduler, no series table). `seriesInfo` (e.g. `"3/12"`) is display-only. No bulk edit/delete by design.
- **Credit cards:** `Account` has optional `creditLimit` (BigDecimal) and `dueDayOfMonth` (Integer 1-31). No statement-cycle model — just a recurring day. Validated in `AccountResource#validateCreditCardFields`.
- **Credit card bills project onto their linked payment account as real transactions.** `CreditCardBillSyncService#sync(card)` maintains one `Transaction` per open bill (dated on its due date, holding the bill's total) on the card's `paymentAccount`, marked via `Transaction.linkedCard`. Called after every create/edit/delete of a card's own transactions and after any `AccountResource` update (safe to call unconditionally — self-corrects a changed/cleared payment account, due day, or kind). These rows flow through normal balance math for free; `TransactionResource` rejects direct `PUT`/`DELETE` on one (`linkedCard != null` → 400), and the frontend renders them dashed with no edit/clone/delete, just a "View bill" link to Card Bills. Chosen over an earlier client-side-only "Projected" row after that approach caused repeated double-counting/month-leakage bugs.
- **TokenService:** extracted from `AuthResource` into `security/TokenService` — both `AuthResource` and `UserResource` (after profile email change) use it to issue JWTs.
- **Delete pattern:** in-card/in-row confirm panel (no `window.confirm`, no modal), pre-validates before showing confirm step when something might reference the row (e.g. `GET /categories/{id}/usage`). Skip pre-check only when nothing could reference the row (Budget, Transaction).

## Dev environment

- **Local dev runs via Docker Compose** — containers `ledger-backend` (8080), `ledger-frontend` (5173), `ledger-db` (5432). Check `docker ps` before assuming anything needs starting.
- **Editing any `.java` file while `quarkus:dev` is running wipes the local database** (Hibernate `drop-and-create` on live-reload). Expected. Local data is disposable.
- **The real logged-in user** is `ricardompcampos@hotmail.com`, not the seeded `demo@ledger.app` account.
- CORS in dev allows `http://localhost:5173` and the ngrok dev URL (`flattop-depth-dropper.ngrok-free.dev`).
- Prod CORS is locked to `https://ledger-finance.darkroasted.vps-kinghost.net`.

## Deployment

- CI: GitHub Actions on self-hosted runners (`graalvm-25` for backend, `easynode-debian` for frontend/deploy)
- Secrets: Doppler (`prd` config) — `DOPPLER_AT_SECRETS` GitHub secret is the only secret in GH Actions
- Docker Hub: `thermcampos/ledger-backend` (versioned `vYYYY.MM.DD.<run_number>` + `latest`), `thermcampos/ledger-frontend` (`latest` only)
- Deploy workflow: triggered after Backend CI or Frontend CI completes → Terraform plan+apply to Kubernetes
- Terraform state: Cloudflare R2, bucket `ledger-finance`
- DB backups: Kubernetes CronJob → R2 bucket `ledger-finance-backups`, twice daily

## Known gaps / deferred

- Demo login broken: `seed-data.sql` hash uses `$2b$` prefix, Elytron wants `$2a$`. Fix: regenerate hash via `BcryptUtil.bcryptHash`.
- No refresh tokens — re-login after 7 days.
- No date-range query params on `GET /transactions/account/{id}` — filtering is client-side over full history.
- No `series_id` on Transaction — repeat/installment occurrences share only `seriesInfo` string. Consequence: deleting one leaves a gap in numbering; no "delete all future" affordance. Tracked in TODO.md §8.
- No dashboard aggregation endpoint — Overview computes totals client-side.

## Commands

```bash
# Preferred: full stack via Docker Compose
docker compose up

# Backend only (local JVM)
cd backend && ./mvnw quarkus:dev          # dev server, localhost:8080
./mvnw package -Pnative                    # native build

# Frontend only (local Node)
cd frontend && npm install && npm run dev  # localhost:5173

# Seed data (after backend has created the schema)
psql -h localhost -U ledger -d ledger -f backend/seed-data.sql
```
