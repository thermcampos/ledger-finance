# Ledger — Project Context

Personal finance app. Read this before making changes — it captures decisions made during design and architecture discussion that aren't otherwise obvious from the code.

## Design language — do not deviate without asking

- **Dark mode only.** No light theme, no toggle.
- **The "ledger" concept is the whole point.** Every monetary figure is set in monospace (IBM Plex Mono), right-aligned, tabular. This is the one non-negotiable rule — if you add a new figure anywhere (a new stat, a new card), it follows this rule too.
- **Fraunces (serif)** is reserved for the hero balance number and page titles only. Do not use it for body text or labels — that dilutes the effect.
- **No charts.** Budgets and spending are shown as cards with progress bars and status words (On track / Near limit / Over budget), not pie or line charts. This was an explicit choice, not an oversight.
- **Palette is muted, not neon:** jade `#4FA98A` for positive, brick-red `#C75450` for negative, gold `#C9A227` reserved for "near limit" warnings only. Background is ink-navy `#0E1116`, not true black.
- **Hairline borders** (`#262C36`) do the separating — avoid drop shadows or heavy card elevation.
- Tokens live in `frontend/src/styles/tokens.scss`. Treat that file as the source of truth; if the UI and the tokens ever disagree, fix the UI, not the tokens.

## Architecture decisions

- **Backend: Quarkus (Java 21, Maven), not Node.** Explicit choice for native-image builds via GraalVM — fast startup, low memory. Don't suggest swapping to Spring Boot or Express.
- **IDENTITY, not Hibernate SEQUENCE, for entity IDs.** Changed deliberately so plain SQL (seed scripts, manual fixes) never has to guess Hibernate's sequence names. Keep this pattern for any new entity.
- **Monorepo:** `/frontend` and `/backend` in one repo, deployed as two separate artifacts.
- **Auth:** full signup/login, JWT via SmallRye JWT, 7-day bearer tokens, no refresh flow yet. BCrypt via `quarkus-elytron-security-common`'s `BcryptUtil` (not jBCrypt).
- **Budget spend is computed live** from transactions (`GET /budgets/month/{yyyy-MM}/spend`), not stored — don't add a cached "spent" column to the Budget entity, it'll drift.

## Known gaps / next steps

- No Flyway/Liquibase yet — dev mode uses `drop-and-create`. Add real migrations before anything resembling production.
- No refresh tokens — sessions just expire after 7 days and require re-login.
- CORS is hardcoded to `http://localhost:5173` in `application.properties` — update before deploying the frontend anywhere else.
- Demo data: `backend/seed-data.sql` (login `demo@ledger.app` / `demo12345`).

## Commands

```bash
# Backend
cd backend && ./mvnw quarkus:dev          # dev server, localhost:8080
./mvnw package -Pnative                    # native build

# Frontend
cd frontend && npm install && npm run dev  # localhost:5173

# Seed data (after backend has created the schema at least once)
psql -h localhost -U ledger -d ledger -f backend/seed-data.sql
```
