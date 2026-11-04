# Ledger — Project Context

Personal finance app. Read this before making changes — it captures decisions made during design and architecture discussion that aren't otherwise obvious from the code.

## Design language — do not deviate without asking

- **Dark-first, with an opt-in light theme.** Dark is the default and the app's identity; light is an explicit per-device choice (toggle on the Profile page), persisted in `localStorage`. `prefers-color-scheme` is deliberately ignored — the theme only changes via the toggle. Every new UI must work in **both themes** — a standing design rule alongside the monospace-figures rule. Decision record: `docs/light-theme.md`.
- **The "ledger" concept is the whole point.** Every monetary figure is set in monospace (IBM Plex Mono), right-aligned, tabular, in both themes. This is the one non-negotiable rule — if you add a new figure anywhere (a new stat, a new card), it follows this rule too.
- **Fraunces (serif)** is reserved for the hero balance number and page titles only, in both themes. Do not use it for body text or labels.
- **No charts.** Budgets and spending are shown as cards with progress bars and status words (On track / Near limit / Over budget). This was an explicit choice.
- **Palette is muted, not neon** in both themes: jade for positive, brick-red for negative, gold reserved for "near limit" warnings only. Dark background is ink-navy `#0E1116` (not true black); light is paper, not inverted-navy. The light palette is designed for WCAG AA contrast, not inverted — verify changes with `cd frontend && npm run check:contrast`.
- **Hairline borders** do the separating — avoid drop shadows or heavy card elevation.
- **All colors come from the tokens** — `frontend/src/styles/tokens.scss` (dark palette + compile-time Bootstrap Sass vars) and `frontend/src/styles/_themes.scss` (the `[data-theme='light']` overrides). A hardcoded hex or rgba anywhere else is a lint-by-convention offense. If the UI and tokens disagree, fix the UI, not the tokens. **One accepted exception:** `backend/.../email/EmailPalette.java` mirrors the light palette for email (the SCSS isn't reachable from the backend) — change it in the same PR as any light-token change (ADR-0002).

## Architecture decisions

- **Backend: Quarkus (Java 21, Maven).** Explicit choice for native-image builds via GraalVM. Don't suggest swapping to Spring Boot or Express.
- **IDENTITY, not Hibernate SEQUENCE, for entity IDs.** So plain SQL (seed scripts, manual fixes) never has to guess Hibernate's sequence names. Keep this pattern for any new entity.
- **Monorepo:** `/frontend` and `/backend` in one repo, deployed as two separate artifacts.
- **Auth:** JWT via SmallRye JWT, 7-day bearer tokens, no refresh flow. BCrypt via `quarkus-elytron-security-common`'s `BcryptUtil` (not jBCrypt, always `$2a$` prefix).
- **Budget spend is computed live** from transactions (`GET /budgets/month/{yyyy-MM}/spend`), not stored — don't add a cached "spent" column to Budget, it'll drift.
- **Balance math:** `Account.openingBalance` (immutable, set at creation) + `recomputeAccountBalance()` in `CreditCardBillSyncService` (moved out of `TransactionResource` once a second call site needed it) — re-derives `account.balance` and every `runningBalance` in chronological order (`occurredOn`, then `id`) on every create/edit/delete. Never touch insertion-order-based math.
- **Flyway:** active in prod (`%prod.quarkus.flyway.migrate-at-start=true`). Dev uses `drop-and-create`. Migrations live in `backend/src/main/resources/db/migration/`.
- **Repeat/installments:** one `RepeatFrequency` enum (`NONE, WEEKLY, MONTHLY, YEARLY, INSTALLMENTS`) — installments are just another repeat value. Pre-generated as flat `Transaction` rows at create time (no scheduled generation, no series table). Each row carries `seriesId` (shared UUID), `seriesRepeat` (the enum — the **only** way to tell installments from recurring once saved) and `seriesInfo` (`"i/N"`, display-only, same format for both). INSTALLMENTS splits the total (HALF_UP to cents, remainder on the last row) and steps monthly; the others repeat the full amount. Edit/delete offer "this" or "this and future" scope; a FUTURE amount edit re-splits installments but flat-sets recurring. Deletes renumber `seriesInfo`; a series shrunk to one row has all three series fields nulled (it becomes a one-off). Rows predating V8/V9 may have `seriesInfo` with null `seriesId`/`seriesRepeat`.
- **Credit cards:** `Account` has optional `creditLimit` (BigDecimal) and `dueDayOfMonth` (Integer 1-31). No statement-cycle model — just a recurring day. Validated in `AccountResource#validateCreditCardFields`.
- **Credit card bills project onto their linked payment account as real transactions.** `CreditCardBillSyncService#sync(card)` maintains one `Transaction` per open bill (dated on its due date, holding the bill's total) on the card's `paymentAccount`, marked via `Transaction.linkedCard`. Called after every create/edit/delete of a card's own transactions and after any `AccountResource` update (safe to call unconditionally — self-corrects a changed/cleared payment account, due day, or kind). These rows flow through normal balance math for free; `TransactionResource` rejects direct `PUT`/`DELETE` on one (`linkedCard != null` → 400), and the frontend renders them dashed with no edit/clone/delete, just a "View bill" link to Card Bills. Chosen over an earlier client-side-only "Projected" row after that approach caused repeated double-counting/month-leakage bugs.
- **Budgets can project their remaining amount onto an account as a real transaction.** `Budget.account` is optional (CHECKING/SAVINGS/CREDIT_CARD only); when set, `BudgetProjectionSyncService#sync(budget)` maintains one `Transaction` dated on the last day of the current month, amount = `limitAmount − real category spend this month`, marked via `Transaction.linkedBudget`. No row when over budget or when account is null. Same rules as card bills: PUT/DELETE rejected with 400, rendered dashed with a "View budget" link. Two exclusions keep it from double-counting: the spend JPQL and `transactionsForCategory` filter `linkedBudget IS NULL` (else the projection counts as its own spend), and client-side sums of "real" activity (Overview recent/due-soon, Transactions month totals) filter `linkedBudget`. A projection on a credit card deliberately feeds that card's bill (bill = actuals + remaining), so budget sync runs before `billSync.sync` and re-syncs any touched card. Month rollover is lazy: `syncAll(user)` runs on `GET /budgets` and the spend endpoint; the daily digest job also calls it for opted-in users, but the on-read sync stays the primary trigger.
- **TokenService:** extracted from `AuthResource` into `security/TokenService` — both `AuthResource` and `UserResource` (after profile email change) use it to issue JWTs.
- **Scheduled jobs = k3s CronJob → internal endpoint** (ADR-0001), never `@Scheduled` in the JVM. The CronJob curls `POST http://ledger-finance-backend-svc:8080/internal/<job>`; `/internal/*` is a JWT permit path guarded by a shared-secret header (constant-time compare, blank secret → 403) and 404s anything carrying `X-Forwarded-For` (i.e. via the Traefik ingress). Jobs must be idempotent and compute dates via `BudgetClock` (São Paulo), never `LocalDate.now()`. First job: the daily digest.
- **Daily budget digest:** 07:00 São Paulo email of every budget flagged `Budget.dailyEmailSummary`, for users with `User.emailSummariesEnabled` on (Profile). `DailyDigestService#sendAll` (triggered by CronJob `ledger-finance-daily-digest` → `POST /internal/digests/daily`, header `X-Digest-Secret` = `DIGEST_TRIGGER_SECRET`) processes one user per transaction, skips users whose `lastDigestSentOn` is today, sets it only after Resend's 2xx, idempotency key `digest-{userId}-{yyyy-MM-dd}`. Figures come from the same `BudgetSpendService#summaryForMonth` as the Budgets page. Profile's "Send test email" → `POST /users/me/digest/test` (ignores the master switch, 1/min). Plan: `docs/daily-digest.md`.
- **Email: Resend over raw REST** (ADR-0002) — `email/ResendClient` + `EmailService#send(to, subject, html, text, idempotencyKey)`; `ledger.email.enabled=false` outside prod logs the text body instead. Qute templates in `templates/email/` (HTML + text variant per email, shared `layout.html`), **light palette only** via `EmailPalette`. Text snapshots in `src/test/resources/snapshots/` — regenerate with `-Dsnapshots.update=true`.
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
- Daily digest: Kubernetes CronJob `ledger-finance-daily-digest`, 07:00 America/Sao_Paulo (`curlimages/curl` → backend Service). Manual run: `kubectl create job --from=cronjob/ledger-finance-daily-digest digest-manual -n ledger-finance`
- Doppler `prd` also holds `RESEND_API_KEY` and `DIGEST_TRIGGER_SECRET` (→ `TF_VAR_*` in `deploy.yml` → `ledger-finance-secrets`)

## Active plans

Multi-change features in progress. Before working on one, read its **Progress** section and update it in the same commit as your work.

- **Daily budget digest** — `docs/daily-digest.md` (decisions: `docs/adr/0001-scheduled-jobs-via-cronjob.md`, `docs/adr/0002-transactional-email-via-resend.md`). Remove this entry when the plan's Status is **implemented**.

## Known gaps / deferred

- Demo login broken: `seed-data.sql` hash uses `$2b$` prefix, Elytron wants `$2a$`. Fix: regenerate hash via `BcryptUtil.bcryptHash`.
- No refresh tokens — re-login after 7 days.
- No date-range query params on `GET /transactions/account/{id}` — filtering is client-side over full history.
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

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues on `thermcampos/ledger-finance`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root, created lazily by the domain-modeling skill. See `docs/agents/domain.md`.
