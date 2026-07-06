# Ledger

A personal finance app. Dark-mode-only, Bootstrap-based front end with a card/ledger visual language, backed by a Quarkus API.

```
ledger-app/
├── backend/     Quarkus (Java 21, Maven) — REST API, Postgres, JWT auth
└── frontend/    React (Vite) + Bootstrap 5 — SPA
```

## Running locally

**1. Backend** (see `backend/README.md` for full setup — database, JWT keys):
```bash
cd backend
./mvnw quarkus:dev
```
Runs on `http://localhost:8080`.

**2. Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173` and proxies `/api/*` requests to the backend (see `vite.config.js`).

## What's wired up vs. stubbed

**Wired end-to-end:**
- Sign up / log in, JWT issued by the backend and attached to every request
- Accounts: list, create, delete
- Transactions: list per account, create (updates the account's running balance)
- Budgets: create/update a monthly limit per category, with spend totals computed live from transactions (`GET /budgets/month/{yyyy-MM}/spend`)

**Stubbed for now (visual only):**
- The "Accounts at a glance" panel on Overview is a placeholder — a category breakdown card, not a chart, per the design brief.

## Demo data

`backend/seed-data.sql` loads a demo user and a realistic set of accounts, categories, transactions, and July 2026 budgets — see `backend/README.md` for how to run it.

## Design reference

The original static mockup (`finance-app-mockup.html` from earlier in this conversation) is the visual source of truth. The tokens in `frontend/src/styles/tokens.scss` and component classes in `main.scss` are a direct port — if the two drift, treat the mockup as the spec and reconcile the SCSS.
