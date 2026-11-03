# 0001 — Scheduled work runs as a k3s CronJob calling an internal backend endpoint

Status: **accepted** (2026-11-03)
Driven by: daily budget digest ([plan](../daily-digest.md))

## Context

Until now the project had **no scheduler by design**: month rollover of budget projections is
lazy (`BudgetProjectionSyncService#syncAll` on `GET /budgets` and the spend endpoint), and
repeat/installment transactions are pre-generated at create time.

The daily budget digest must fire at a wall-clock time (07:00 America/Sao_Paulo) whether or not
anyone opens the app, so lazy evaluation is no longer enough. This is the first scheduled job,
so it sets the pattern for future ones.

## Decision

- Scheduling lives in **Kubernetes**, not in the JVM. A `kubernetes_cron_job_v1` (Terraform) runs
  `curlimages/curl` against the backend's cluster-internal Service:
  `POST http://ledger-finance-backend-svc:8080/internal/<job>`.
- CronJob settings: `time_zone` set explicitly, `concurrency_policy = "Forbid"`,
  `starting_deadline_seconds = 3600`, low `backoff_limit`.
- Endpoints under `/internal/*` bypass JWT (permit path) and are guarded by a shared secret
  header (`X-Digest-Secret`, one secret per job is fine but not required), compared in constant
  time. If the configured secret is blank, the endpoint always returns 403.
- **Defense in depth:** the `ledgerapi` ingress forwards every path to the backend, and a plain
  `Ingress` cannot deny a path. Requests to `/internal/*` carrying `X-Forwarded-For` (which
  Traefik always sets on ingress traffic; in-cluster calls don't have it) are rejected with 404.
- **Every job must be idempotent.** CronJobs can retry or double-fire; the job records what it
  has done (e.g. a "last sent on" date) and skips completed work.
- Jobs compute dates in a configured zone (`ledger.<job>.zone`), never with `LocalDate.now()` on
  the pod's default zone (UTC).
- Jobs may piggyback existing self-correcting syncs (e.g. `budgetSync.syncAll(user)`); the lazy
  on-read sync stays in place — the job is an extra trigger, not a replacement.

## Alternatives considered

- **Quarkus `@Scheduled` (`quarkus-scheduler`).** Simplest to write, but every backend replica
  fires its own run (duplicate emails) unless we add Quartz clustering + DB tables, and a run is
  silently lost if the pod is restarting at fire time. Rejected.
- **External cron service hitting the public API.** Adds a third-party dependency and forces the
  endpoint to be public by design. Rejected.

## Consequences

- CLAUDE.md's "no scheduler in this project" wording must be updated when the first job ships.
- Job health is visible via `kubectl get jobs -n ledger-finance`; the endpoint returns non-2xx on
  total failure so the Job is marked failed.
- Each new job adds a CronJob resource, a secret (or reuses one), and a Doppler/`deploy.yml`
  `TF_VAR_` mapping.
