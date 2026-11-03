# Daily budget digest — implementation plan

Status: **planned** (agreed 2026-11-03). Decisions: [ADR-0001 scheduled jobs](adr/0001-scheduled-jobs-via-cronjob.md),
[ADR-0002 email via Resend](adr/0002-transactional-email-via-resend.md).

## Progress

> **Agents: read this section first, and update it in the same commit as the work.**
>
> - Work on the **first change that isn't `done`**, unless the user says otherwise. Changes 2 and
>   3 are independent; everything else is sequential.
> - Status values: `todo` → `in-progress` → `review` (PR open) → `done` (merged to `main`).
>   Use `blocked` with a reason in Notes if you can't proceed.
> - Tick the change's **Done when** boxes as you verify each one. A change is `done` only when
>   all of its boxes are ticked and it's merged.
> - Add a dated line to the **Log** for every status change, deviation from the plan, or
>   decision made along the way. If a deviation changes a decision, update the ADR too.
> - When all changes are `done`, set the top-level Status to **implemented**.

| # | Change | Status | Branch / PR | Notes |
|---|---|---|---|---|
| 1 | Server-side budget spend & status | `in-progress` | | Implemented, gates green; awaiting owner check of Budgets page + commit |
| 2 | Opt-in flags + UI | `in-progress` | | Implemented, gates green; awaiting owner theme check, V18 on prod copy, commit |
| 3 | Email infrastructure (Resend client) | `done` | `main` @ 540e8fc | Native build green in CI; key in prod pod |
| 4 | Digest content + "Send test email" | `in-progress` | `main` @ ea5bd8b | Deployed; real email received and looks right in Hotmail web. Awaiting Gmail (mobile + desktop) check |
| 5 | Scheduled daily send | `in-progress` | | Deployed; manual run delivered. Awaiting second same-day run (expect skip) + first 07:00 run |

### Log

- 2026-11-03 — Plan and ADR-0001/0002 agreed. Resend DNS records for
  `ledger-finance.darkroasted.vps-kinghost.net` configured by the owner.
- 2026-11-03 — Change 1 → `in-progress`. Chose the `GET /budgets/month/{yyyy-MM}/summary`
  endpoint. Shape: `{yearMonth, today, daysLeft, budgets: [{budgetId, categoryId, categoryName,
  limit, spent, left, status, perDay}]}` — `daysLeft` is month-level (not per budget) since it's
  the same for every budget and the page header needs it with zero budgets; past month → 0,
  future → month length. `perDay` is null when `left ≤ 0`. Also switched
  `BudgetProjectionSyncService` to `BudgetClock` (the digest job calls `syncAll`, ADR-0001 says
  no `LocalDate.now()`). Overview/Report keep using `/spend` (unchanged figures). A limit ≤ 0 stays
  "On track", matching the old `statusFor`.
- 2026-11-03 — Change 2 → `in-progress`. Profile switch is saved through the existing
  `PUT /users/me` (`emailSummariesEnabled`, null → unchanged) and rendered as an On/Off pair
  matching the Theme picker; the budget checkbox reuses the plain checkbox style of Report's
  "Include upcoming". No new color pairings (`check:contrast` passes). Both entity flags carry
  `@ColumnDefault("false")` so the dev `drop-and-create` schema matches V18. Envelope icon is
  `bi-envelope` in `--text-faint`.
- 2026-11-03 — Change 2 validated against a clean Postgres 16 (`task db-up`) with the prod-profile
  JVM jar: Flyway applied V1–V18; `/users/me` and `/budgets` round-trip both flags and the summary
  endpoint returns the expected figures. The V18 box stays open until it's run on a prod copy.
  Unrelated finding: `generation=validate` fails on `api_tokens.token_hash` (V17 `CHAR(64)` vs
  entity `varchar(64)`) — harmless with prod's `generation=none`, not fixed here.
- 2026-11-03 — Change 3 → `in-progress`. `EmailService#send` returns `Optional<String>` (Resend id;
  empty when only logged) and throws `EmailSendException` with `status()` (Resend HTTP status, `0`
  for no response: missing key or connection failure) plus `isRetryable()` (0/429/5xx), for
  change 5's per-user failure handling. "Mocked `ResendClient`" is a hand-written fake (no Mockito
  in the pom). `EmailPalette` is exposed to Qute as `{palette:…}` and carries the two font stacks;
  rgba `-dim` tokens are left out (Outlook drops rgba). Layout slots: `title`, `preheader`, main
  body and `footer`. Native build is **not** run locally (dev VM is too weak). It's verified by Backend
  CI on the `graalvm-25` runner.
- 2026-11-03 — Change 3 → `done` (540e8fc on `main`). Backend CI native build green, deployed;
  owner confirmed `RESEND_API_KEY` is in Doppler `prd` and the running backend pod.
- 2026-11-03 — Change 4 → `in-progress`, at the owner's request while changes 1 and 2 still await
  their manual checks (the code they provide is on `main`). Decisions:
  - `email/DailyDigest` is a pure, pre-formatted model built from change 1's
    `BudgetSummaryResponse` (`DailyDigest.of(summary, flaggedIds, yesterdaySpent, test, profileUrl)`),
    so snapshots need no DB or clock. `DailyDigestService#buildFor` feeds it from the DB.
  - "Yesterday" on the 1st is labelled `Yesterday, Oct 31`. Spent/limit use `Money.abs` (as
    `Budgets.jsx#money`), left and yesterday are signed (`-$112.40`). Per day shows
    "Over budget" when `perDay` is null.
  - Text variant is 56 columns wide; alignment comes from a `txt:` Qute extension
    (`email/TextLayout`). Snapshots live in `src/test/resources/snapshots/daily-digest/`;
    regenerate with `-Dsnapshots.update=true`. The HTML test also writes
    `target/digest-preview.html`.
  - Test emails: subject gets a ` (test)` suffix, and the footer reads "This is a test you sent
    from Profile." (the master switch may be off). New config `ledger.app.url` (prod:
    `https://ledger-finance.darkroasted.vps-kinghost.net`) for the footer's Profile link.
  - `POST /users/me/digest/test` → `{to, delivered}` (`delivered=false` when email is disabled
    and the digest was only logged). Errors are `{message}` JSON: 400 nothing flagged, 429 within
    60 s of the previous test (in-memory, per pod — fine at one replica), 502 Resend failure.
    Needs `@Consumes(WILDCARD)`: the class-level JSON `@Consumes` 415s a bodyless POST.
  - Qute gotcha: a boolean `hasX()` accessor shadows a sibling `x` property in templates — hence
    `perDayAvailable`, not `hasPerDay`.
- 2026-11-03 — Change 4 deployed (ea5bd8b). Incident: the app hostname stopped resolving. It had
  relied on the `*.darkroasted.vps-kinghost.net` wildcard, and the Resend records under
  `ledger-finance.…` (`resend._domainkey`, `send`) made the name exist, so the wildcard no longer
  matched it (NODATA). The PWA service worker kept serving a stale shell, and icon fonts (not
  precached) failed with `ERR_NAME_NOT_RESOLVED`. Fixed by an explicit
  `ledger-finance A 191.252.159.227`. DMARC (`p=none`) was also missing despite the 2026-11-03
  entry above and has now been added. A real test email arrived and renders well in Hotmail web,
  but it **landed in Junk** (the owner marked it safe). Keep an eye on placement once the
  scheduled sends start (change 5).
- 2026-11-03 — Change 5 → `in-progress`. Notes and deviations:
  - The Terraform kubernetes provider attribute is `timezone`, not `time_zone`. Checked with
    `terraform validate` against the provider schema, and the plan text above is fixed.
  - CronJob: image pinned to `curlimages/curl:8.11.1`; `restart_policy = "Never"` (so
    `backoff_limit = 2` means two fresh retry pods), job history 3/3, and `curl -f` so the 500
    "every send failed" response marks the Job failed and triggers the retry. A partial failure
    returns 200 and isn't retried until the next day (failed users stay unmarked).
  - `sendAll` captures "today" once per run. Each user runs in `QuarkusTransaction.requiringNew()`:
    the `syncAll`, send and mark all roll back together on failure. With email disabled (dev), a
    logged digest counts as sent and is marked.
  - Users are selected by JPQL (`dailyEmailSummary = true AND user.emailSummariesEnabled = true`,
    distinct). A user whose digest builds empty is counted as skipped.
  - Tests swap `EmailService` with `QuarkusMock` (a subclass, no Mockito). The unset-secret
    case runs under its own `@TestProfile` (one extra Quarkus boot).
  - **Not done here:** the top-level Status stays **planned**, and CLAUDE.md keeps its Active
    plans entry, until changes 1, 2 and 4 close their remaining manual boxes.

## Feature

A daily email at **07:00 America/Sao_Paulo** summarising every budget the user flagged with
**"Daily email summary"**, sent only if the user has **"Email summaries"** enabled on Profile.
One email per user per day; no email if no budget is flagged.

Per flagged budget: spent, limit, left, status word, progress bar, per-day remaining, and
yesterday's spend. The numbers must equal what the Budgets page shows.

```
Subject: Ledger · Budgets for Tue, Nov 3

Groceries                                   Near limit
[██████████████████░░░]
Spent          $1,742.10      Limit          $2,000.00
Left             $257.90      Per day ×28        $9.21
Yesterday         $84.20
```

Rules:
- **Days left includes today**: `lastDay − today + 1` (≥ 1, so never divide by zero).
- **Per day** = `left / daysLeft`; when `left ≤ 0` show "Over budget" instead.
- **Yesterday** = signed spend for the category on `today − 1`, same exclusions as month spend.
  On the 1st it's the previous month's last day — shown, labelled with its date; month totals
  are the new month's.
- **Order**: Over budget → Near limit → On track, then by category name.
- **Money format** matches `Budgets.jsx#money`.
- "Today" is always computed in `America/Sao_Paulo` (config), never the pod's UTC default.

Prerequisites: Resend domain DNS — **done** (2026-11-03).

---

## Changes

Five changes, in order. Each one leaves `main` deployable and is useful/testable on its own.

### Change 1 — Server-side budget spend & status

*Pure refactor + one bug fix. No schema change, no new UI.*

- Extract `service/BudgetSpendService` from `BudgetResource#spendForMonth`: the JPQL with its
  exclusions (`linkedBudget IS NULL`, `category.internal = false`, future-dated rows excluded
  unless `includeUpcoming`). Add a `spendBetween(user, start, end)` variant (used for
  "yesterday" in change 4).
- Add `enums/BudgetStatus` (`ON_TRACK`, `NEAR_LIMIT`, `OVER_BUDGET`) and a single threshold
  constant (85%) — the backend becomes the source of truth for `Budgets.jsx#statusFor`.
- Add a `BudgetClock` (or similar) bean exposing `today()` in `ledger.budget.zone=America/Sao_Paulo`.
  Use it in `BudgetSpendService` instead of `LocalDate.now()`.
- Spend response gains `status` when a budget exists for the category (or a new
  `GET /budgets/month/{yyyy-MM}/summary` returning limit/spent/left/status/daysLeft/perDay per
  budget — pick whichever keeps `Budgets.jsx` simpler; the summary endpoint is what change 4
  will reuse directly, so it's preferred).
- `Budgets.jsx`: render status from the server; fix days left to `lastDay − today + 1`.

**Done when:**
- [ ] Budgets page looks identical except days left is +1 (and never 0 on the last day)
- [x] Tests cover the spend exclusions, zone-based today, and the three status thresholds

### Change 2 — Opt-in flags + UI

*Schema + toggles. Flags are stored but nothing reads them yet.*

- `V18__email_summary_flags.sql`:
  ```sql
  ALTER TABLE budgets ADD COLUMN daily_email_summary BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users   ADD COLUMN email_summaries_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ```
- `Budget.dailyEmailSummary`, `User.emailSummariesEnabled`.
- `UpsertBudgetRequest.dailyEmailSummary` (Boolean, null → false). Profile GET/PUT in
  `UserResource` exposes `emailSummariesEnabled`.
- **Budgets form:** "Daily email summary" checkbox. When the profile switch is off, keep it
  usable with a muted hint "Emails are off — turn them on in Profile" (link). Flagged budget
  cards show a small envelope icon.
- **Profile page:** "Email summaries" toggle with helper text "Daily at 07:00 (São Paulo time)".
- Both themes; `npm run check:contrast` for any new color pairing.

**Done when:**
- [ ] Both flags round-trip through the API and survive a reload (API round-trip covered by `EmailSummaryFlagsTest`; reload is the owner's check)
- [ ] Checkbox, hint and Profile toggle checked in dark and light themes
- [ ] V18 applies cleanly on a copy of prod data

### Change 3 — Email infrastructure (Resend client)

*No user-visible feature. Can be developed in parallel with change 2.*

- `email/ResendClient` (`@RegisterRestClient(configKey = "resend-api")`, `POST /emails`,
  headers `Authorization: Bearer …`, `Idempotency-Key`), request/response DTOs
  (`from`, `to[]`, `subject`, `html`, `text` → `id`).
- `email/EmailService#send(to, subject, html, text, idempotencyKey)`: calls Resend when
  `ledger.email.enabled=true`, otherwise logs the text body. Maps Resend 4xx/5xx to a typed
  exception with the response message.
- `email/EmailPalette` — light-palette constants mirroring `_themes.scss` (ADR-0002), with a
  keep-in-sync comment; add a matching comment in `_themes.scss` pointing back.
- Add `quarkus-qute`; a base email layout template (`templates/email/layout.html`).
- Config:
  ```properties
  quarkus.rest-client.resend-api.url=https://api.resend.com
  ledger.resend.api-key=${RESEND_API_KEY:}
  ledger.email.from=Ledger <digest@ledger-finance.darkroasted.vps-kinghost.net>
  ledger.email.enabled=false
  %prod.ledger.email.enabled=true
  ```
- Infra: `RESEND_API_KEY` in Doppler `prd` → `deploy.yml` (`TF_VAR_resend_api_key`) →
  `variable "resend_api_key"` → `ledger_finance_secrets` → backend env `RESEND_API_KEY`.
- Verify the native build still passes (Qute + REST client in native).

**Done when:**
- [x] Unit test with mocked `ResendClient` passes (send path + log-only path + error mapping)
- [x] Native build is green
- [x] `RESEND_API_KEY` is present in the running backend pod

### Change 4 — Digest content + "Send test email"

*First real email. Manual trigger only — no schedule yet.*

- `service/DailyDigestService#buildFor(user)` → digest model from change 1's summary for
  flagged budgets + yesterday's spend; returns empty when nothing is flagged.
- Qute templates `email/daily-digest.html` + `email/daily-digest.txt` per the layout above
  (monospace right-aligned figures, two-cell table progress bar, hairline borders, footer
  "You're receiving this because daily summaries are on." + Profile link).
- `POST /users/me/digest/test` (JWT): builds and sends now to the current user, **ignoring** the
  master switch; 400 "No budgets selected for the summary" if nothing is flagged. Idempotency key
  `digest-test-{userId}-{epochMinute}`; reject more than one per minute.
- **Profile page:** "Send test email" button next to the toggle, inline success/error text.

**Done when:**
- [x] A real test email arrives at `ricardompcampos@hotmail.com`
- [ ] It renders correctly in Outlook/Hotmail web and Gmail (mobile + desktop) (Hotmail web ✓ 2026-11-03; Gmail pending)
- [x] Snapshot tests (text variant): On track / Near limit / Over budget / last day of month / 1st of month

### Change 5 — Scheduled daily send

*Turns the feature on. Implements ADR-0001.*

- `V19__user_last_digest_sent_on.sql`: `ALTER TABLE users ADD COLUMN last_digest_sent_on DATE;`
  (`User.lastDigestSentOn`, `@JsonIgnore`).
- `DailyDigestService#sendAll()`:
  ```
  for each user with emailSummariesEnabled and ≥1 flagged budget:
      if lastDigestSentOn == today(zone): skip
      budgetSync.syncAll(user)                // month rollover even if the app isn't opened
      send(buildFor(user), idempotencyKey = "digest-{userId}-{yyyy-MM-dd}")
      lastDigestSentOn = today                // only after Resend 2xx
  ```
  One transaction per user; one user's failure is logged and doesn't stop the others.
- `resource/InternalDigestResource` — `POST /internal/digests/daily`:
  - `/internal/*` added as a permit path; resource checks `X-Digest-Secret` against
    `ledger.digest.trigger-secret=${DIGEST_TRIGGER_SECRET:}` in constant time; blank secret →
    always 403.
  - Requests carrying `X-Forwarded-For` (i.e. via Traefik ingress) → 404.
  - Returns `{sent, skipped, failed}`; 500 only if every attempted send failed.
- Infra: `DIGEST_TRIGGER_SECRET` through Doppler → `deploy.yml` → Terraform secret → backend env
  and CronJob env. New `kubernetes_cron_job_v1.ledger_finance_daily_digest`:
  `schedule = "0 7 * * *"`, `timezone = "America/Sao_Paulo"`, `concurrency_policy = "Forbid"`,
  `starting_deadline_seconds = 3600`, `backoff_limit = 2`, image `curlimages/curl`:
  ```sh
  curl -fsS -X POST -H "X-Digest-Secret: $DIGEST_TRIGGER_SECRET" \
    http://ledger-finance-backend-svc:8080/internal/digests/daily
  ```
- Docs: update CLAUDE.md — architecture section (digest, first scheduled job per ADR-0001,
  `EmailPalette` exception per ADR-0002); replace "no scheduler in this project" in the
  `BudgetResource#list` javadoc and CLAUDE.md; mark this plan **implemented**.

**Done when:**
- [x] Tests: skip-when-already-sent, mark-sent-only-on-success, one user's failure doesn't stop others
- [x] Tests: internal endpoint 403 (missing/wrong/unset secret) and 404 (via ingress)
- [x] After deploy, `kubectl create job --from=cronjob/ledger-finance-daily-digest digest-manual -n ledger-finance` sends one email
- [ ] Running it a second time the same day sends none
- [ ] First scheduled 07:00 run observed in the inbox
- [x] CLAUDE.md updated

---

## Out of scope (for now)

- Per-user send time or timezone.
- Weekly/monthly digests, digest for accounts or card bills.
- Unsubscribe link handling (the footer links to Profile; volume is far below bulk-sender rules).
- 2026-11-03 — Change 5 deployed with `DIGEST_TRIGGER_SECRET` in Doppler `prd`. The manual
  `kubectl create job … digest-manual` run delivered one digest, and it landed in the Outlook
  **inbox**, not Junk (the earlier test email went to Junk before DMARC and "mark as safe").
- 2026-11-03 — Native-only bug found in the prod logs: `POST /internal/digests/daily` returned
  500 because Jackson couldn't serialize `RunResult`. The endpoint returns a plain `Response`,
  so Quarkus didn't register the type for reflection, and JVM tests can't catch that. The digest
  itself was sent and marked before the response failed. The CronJob's retries (backoff 2) then
  skipped the already-sent user, so no duplicate emails went out, but the Job was marked failed.
  Fixed with `@RegisterForReflection` on `RunResult`. Rule for future endpoints: a custom type
  returned only inside a `Response` needs `@RegisterForReflection` (or return `RestResponse<T>`).
