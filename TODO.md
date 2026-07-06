# Ledger — Outstanding Work

## Status as of end of session (2026-07-06, evening)

**Done and committed:** §1–§4 (Categories page, Add-transaction form,
Add/edit-budget form + Overview budget panel, Transactions filters + Export,
Overview date-range dropdown) are all implemented and committed as 5
separate commits (`319c023` through `c7af925`, one per chunk). Local branch
is 2 commits ahead of `origin/main` — not pushed yet, no push has been
requested.

**Uncommitted:** only this file (`TODO.md`) — the §7 edit/delete tracking
section added below was written after the last commit and hasn't been
committed.

**Not started:** §7 (edit/delete for Transactions/Budgets/Accounts/
Categories + a User profile page) — tracked below, nothing built yet.
Suggested order there: Account + Category edit/delete first, then Budget
delete, then User profile, then Transaction edit/delete last (trickiest,
touches running-balance recomputation).

**Environment reminders for next session** (see [[project-dev-environment]]
in memory for more):
- Local dev runs via `docker compose` — containers `ledger-backend` (8080),
  `ledger-frontend` (5173), `ledger-db` (5432) — check `docker ps` before
  assuming anything needs starting.
- The real logged-in user is `ricardompcampos@hotmail.com`, not the seeded
  `demo@ledger.app` account.
- **Demo login is still broken** (`seed-data.sql`'s bcrypt hash uses an
  incompatible `$2b$` prefix) — not fixed, see §5.
- **Editing any file under `backend/src/main/java` while `quarkus:dev` is
  running wipes the local database** (Hibernate `drop-and-create` on live
  reload) — expect this, not a bug. User has said to just proceed without
  pausing for confirmation each time, since local data is disposable.

Snapshot from a full frontend + backend audit (2026-07-06). The backend is
further along than it looks from the UI — Transactions, Budgets, and
Categories all have working create endpoints that are simply never called.
The gap is almost entirely in the frontend; a couple of backend gaps are
called out separately at the end.

Reference pattern for "how a working button looks in this codebase":
`frontend/src/pages/Accounts.jsx` — `useState` toggle for a panel +
controlled form inputs + `useMutation` (react-query) + `queryClient
.invalidateQueries` on success. There is no shared `<Modal>` or `<Dropdown>`
component yet, so the first one built should probably be extracted for reuse
rather than copy-pasted three more times.

## 1. Categories — no UI at all (highest priority, blocks the rest)

Backend is fully ready: `Category` entity, `GET /categories`, `POST
/categories` (`backend/src/main/java/com/ledger/category/CategoryResource.java`).
Frontend `CategoriesApi.list()` / `.create()` already exist in
`frontend/src/api/ledger.js:14-17` but are never imported anywhere.

- [x] Add a Categories page (`frontend/src/pages/Categories.jsx`) with list +
      create form (name, color), using the Accounts.jsx pattern.
- [x] Add `/categories` route in `App.jsx`.
- [x] Add "Categories" link to `Sidebar.jsx` (`links` array, currently only
      Overview/Transactions/Budgets/Accounts).
- [ ] Backend: add `PUT /categories/{id}` and `DELETE /categories/{id}` —
      currently create/list only, no edit or delete.
- [ ] Once this exists, wire the Transactions category filter/picker to
      `CategoriesApi.list()` instead of the hardcoded `categoryColors` object
      (`Transactions.jsx:112-117`).

## 2. Transactions page — "Add transaction" is a dead button

`Transactions.jsx:86-89` — no `onClick`, no form/modal exists anywhere.
Backend `POST /transactions` already works
(`backend/src/main/java/com/ledger/transaction/TransactionResource.java:36`),
required fields: `accountId`, `description`, `amount`; optional:
`categoryId`, `occurredOn` (defaults to today). Note it also updates the
account's running balance server-side as a side effect.
Frontend `TransactionsApi.create` already exists in `ledger.js:22`.

- [x] Build the add-transaction form/panel (account select, category select
      populated from `CategoriesApi.list()`, description, amount, date).
- [x] Wire it to `TransactionsApi.create` + invalidate the relevant queries
      (account list for balance, transactions list).
- [x] Wire the account filter select (`Transactions.jsx:104-109`) — currently
      renders options but has no `onChange`/state.
- [x] Wire the category filter select (`Transactions.jsx:112-117`) — same
      issue, also depends on item 1. Now populated from `CategoriesApi.list()`.
- [x] Wire the date-range select ("Last 30 days" / "Last 90 days" / "This
      year", `Transactions.jsx:120-124`) — filtering is still done client-side
      over all fetched transactions (no backend date-range params yet, see
      §6), but the control now actually filters the visible list.
- [x] Wire or remove the "Export" button (`Transactions.jsx:127-130`) —
      exports the currently filtered transactions as a CSV download.

## 3. Budgets page — no way to create or edit a budget

`Budgets.jsx:51-54` — "Edit budgets" button has no `onClick`, and there's no
"Add budget" affordance either. Backend `POST /budgets` is a working
upsert-by-category-and-month
(`backend/src/main/java/com/ledger/budget/BudgetResource.java:67`), needs
`categoryId`, `month`, `limitAmount`. Frontend `BudgetsApi.upsert` already
exists in `ledger.js:30`.

- [x] Build a set/edit-limit form (category select, month, limit amount),
      reusing the Accounts.jsx pattern, calling `BudgetsApi.upsert`.
- [x] `Budgets.jsx:24` hardcodes `yearMonth` to the current month
      (`new Date().toISOString().slice(0, 7)`) — no way to view or set a
      budget for any other month. Add month navigation.
- [x] `Overview.jsx:118-124` has a placeholder panel ("Category breakdowns
      will live here once budgets have real spend data behind them") even
      though `GET /budgets/month/{yearMonth}/spend` already returns exactly
      that data — just needs to be fetched and rendered (as cards/progress
      bars per CLAUDE.md, not charts).

## 4. Overview page — "This month" button does nothing

`Overview.jsx:51-54` — static button, no `onClick`, no dropdown markup, no
date-range state anywhere on the page.

- [x] Build the dropdown (This week / Last week / This month / Last 30 days /
      This year) — added as a reusable `frontend/src/components/Dropdown.jsx`
      (generic trigger + menu, click-outside-to-close), styled to match
      `.btn-ghost` and the hairline-border/no-shadow language.
- [x] Wire selection to the "Recent activity" list — filtered client-side
      over the already-fetched per-account transactions (same approach as
      the Transactions date-range filter in §2/§4; no backend date-range
      endpoint needed at current data volumes, see §6).

## 5. Security / data fixes found and applied during implementation

- [x] `User.passwordHash` had no `@JsonIgnore` — every endpoint that embeds a
      `User` relation (Category, Account, Transaction, Budget) was leaking
      the bcrypt hash in plain JSON. Fixed in
      `backend/src/main/java/com/ledger/user/User.java`.
- [x] `seed-data.sql`'s transaction INSERTs referenced the `t` (VALUES)
      alias inside the `categories` JOIN condition before `t` was introduced
      in the FROM clause — fails on Postgres ("missing FROM-clause entry for
      table t"). Fixed by reordering the JOINs so `t` is introduced before
      it's referenced.
- [ ] `seed-data.sql`'s demo password hash uses a `$2b$` bcrypt prefix that
      Quarkus's Elytron `BcryptUtil` doesn't recognize (`ELY08003: Unknown
      crypt string algorithm`) — demo login (`demo@ledger.app`/`demo12345`)
      is currently broken. Needs a hash regenerated via `BcryptUtil.bcryptHash`
      (Elytron-compatible, likely `$2a$` prefix) rather than a hash lifted
      from another bcrypt implementation.

**Note:** editing any file under `backend/src/main/java` while `quarkus:dev`
is running triggers a live-reload schema regeneration (`drop-and-create`,
per the Known Gaps section above) — it silently wipes all local data. Not a
bug to fix, just something to expect until real migrations exist.

## 6. Backend gaps

- [ ] No date-range query params on `GET /transactions/account/{accountId}`
      — returns everything, unbounded, no pagination. Needed for both the
      Overview dropdown and the Transactions date-range select to be
      meaningful server-side rather than client-side filtering over the full
      history.
- [ ] No dashboard/stats aggregation endpoint — Overview currently computes
      totals client-side from full per-account transaction lists fetched one
      account at a time. Fine for now at small data volumes, but worth an
      endpoint if this needs to scale.
- [ ] No `DELETE`/`PUT` for Transaction or Budget (Budget's create doubles as
      update via upsert, so this is lower priority than Category's missing
      edit/delete).

## Suggested order (all done as of 2026-07-06)

1. [x] Categories page (unblocks category pickers everywhere else).
2. [x] Add-transaction form.
3. [x] Add/edit-budget form + wire the Overview budget-spend panel (data
   already exists server-side, purely a frontend job).
4. [x] Transactions filters (account/category/date) + Export.
5. [x] Overview "This month" dropdown (client-side range filter).

All five UI-wiring chunks from this audit are implemented. What's left is
§6's backend gaps (date-range/pagination endpoint, Category edit/delete,
Transaction/Budget delete) and the outstanding bcrypt-prefix bug in
§5 (demo login) — none of these block normal use of the app with a real
account, they're follow-ups for later.

## 7. Edit/delete + profile management (requested 2026-07-06, not yet built)

Every entity currently only supports create + list. There is no edit or
delete UI anywhere, and the only delete endpoint that exists server-side
(`DELETE /accounts/{id}`) isn't even called from the frontend. None of this
is built yet — tracked here for a future round of chunks.

1. **Transactions** — no edit, no delete, anywhere.
   - Backend: no `PUT`/`DELETE /transactions/{id}` at all
     (`backend/src/main/java/com/ledger/transaction/TransactionResource.java`
     only has `GET`/`POST`). A delete needs to reverse the transaction's
     effect on `account.balance` and re-derive `runningBalance` for later
     transactions on that account — not a trivial delete, needs thought.
   - Frontend: no edit/delete affordance on any `txn-row` in
     `Transactions.jsx`.

2. **Budgets** — edit already works implicitly (re-submitting the same
   category+month via `POST /budgets` upserts the limit), but there's no
   delete and no explicit per-card edit affordance.
   - Backend: no `DELETE /budgets/{id}`.
   - Frontend: no delete button on `budget-card`; editing means reopening
     the top form and re-picking the same category rather than clicking
     "edit" on the card itself.

3. **Accounts** — backend already has `DELETE /accounts/{id}` and
   `AccountsApi.remove()` exists in `ledger.js`, but nothing in
   `Accounts.jsx` calls it — no delete button on `account-card-lg` at all.
   No edit (`PUT`) exists on either side — can't change name/institution/
   kind after creation.
   - Backend: needs `PUT /accounts/{id}`.
   - Frontend: needs a delete affordance (with a confirm step — deleting an
     account presumably should be blocked or cascade-handled if it still
     has transactions, similar to the FK constraint hit during testing of
     chunk 2) and an edit form.

4. **Categories** — no edit, no delete, on either side (same gap noted in
   §1). Deleting a category needs a decision on what happens to existing
   transactions/budgets referencing it (null out `category_id`? block?).
   - Backend: needs `PUT`/`DELETE /categories/{id}`.
   - Frontend: needs edit/delete affordance on `Categories.jsx`'s list rows.

5. **User profile** (email, password, display name) — nothing exists at
   all: no backend endpoint, no frontend page/route/sidebar link.
   - Backend: no `UserResource`/profile endpoint anywhere — only
     `POST /auth/signup` and `POST /auth/login`. Changing a password
     should go through `BcryptUtil` (same as signup) and probably require
     the current password as confirmation. Changing email likely needs a
     uniqueness check (same constraint signup already enforces).
   - Frontend: needs a Settings/Profile page, route, and sidebar entry —
     none exist today.

**Suggested build order:** Account edit/delete and Category edit/delete
first (simplest, most requested day-to-day), then Budget delete, then User
profile (self-contained, new page), then Transaction edit/delete last since
it's the trickiest (running-balance recomputation on delete/edit affects
every later transaction on that account).
</content>
