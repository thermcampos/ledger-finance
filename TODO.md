# Ledger — Outstanding Work

## Status as of end of session (2026-07-07, later)

**Done, not yet committed: Credit cards feature** (requested 2026-07-07,
planned via plan mode, plan saved at
`/home/ricardo/.claude/plans/luminous-painting-pillow.md`).
- Backend: `Account` gained `creditLimit` (nullable BigDecimal) and
  `dueDayOfMonth` (nullable Integer, 1-31, a simple recurring day — no
  statement-cycle/billing-period model, decided explicitly). Both editable
  via `CreateAccountRequest`/`UpdateAccountRequest`, validated in
  `AccountResource#validateCreditCardFields` (400 on negative limit or
  out-of-range day). Both optional — a credit card account can exist
  without them.
- Frontend: `Accounts.jsx`'s add/edit forms conditionally show "Credit
  limit"/"Due day of month" fields when Kind = Credit Card (gated on kind
  *at submit time*, so switching kind away before saving discards stray
  values). New page `frontend/src/pages/CreditCards.jsx` (route
  `/credit-cards`, sidebar link after Accounts) — a glance dashboard: total
  owed/limit/available-credit summary panel, per-card utilization progress
  bar + status word ("Good standing"/"Near limit"/"Over limit", same
  85%/100% thresholds as Budgets.jsx) reusing existing `.track`/
  `.budget-status` CSS (no new styles needed), and a due-date line
  ("Due {date} · in N days") computed by rolling `dueDayOfMonth` forward to
  its next occurrence (clamped for short months). Gracefully omits the bar/
  due-date line when those fields are null.
- Also fixed: on `Transactions.jsx`, filtering to a single credit-card
  account now shows its balance as a positive "Amount owed" (label + sign +
  color all flip), consistently across the headline stat, each day-group
  total, and each row's running-balance figure — the underlying balance
  math (`recomputeAccountBalance`, `openingBalance`) is untouched, this is
  display-only. The "All accounts" net total (assets minus card debt) is
  intentionally left as a real negative-inclusive sum, unaffected.
- Not done / explicitly deferred: no bulk/statement-history tracking, no
  "pay down" flow — this is glance/visibility only, same spirit as §8's
  deferred recurring-series tracking.

## Status as of end of session (2026-07-07)

**Done and committed:** §1–§6 UI-wiring chunks (Categories page,
Add-transaction form, Add/edit-budget form + Overview budget panel,
Transactions filters + Export, Overview date-range dropdown) — 5 commits,
`319c023` through `c7af925`. §7 **Account edit/delete** is also done and
committed (`d5aacaa`).

**Also done and committed:** §7 **Category edit/delete** (backend
`PUT`/`DELETE /categories/{id}` + `GET /categories/{id}/usage`, frontend
edit/delete rows in `Categories.jsx`, plus a follow-up: category color
picker now auto-picks a random non-repeating color from a 10-color palette
on "Add category" instead of showing 5 fixed presets, with a "Choose color"
toggle to override manually) and §7 **Budget delete** (backend
`DELETE /budgets/{id}` — no usage-check needed, nothing references a Budget
row; frontend edit/delete icons on `budget-card`, pencil reopens the
existing "Set budget" form pre-filled).

**Done, not yet committed:** §7 **User profile** page — see §7 item 5 below
for full detail — plus two bug fixes found along the way:
1. `client.js`'s global 401 interceptor was catching failed-login 401s (bad
   credentials) as if they were expired-session 401s, forcing a hard
   `window.location.href = '/login'` reload instead of letting `Login.jsx`
   show its inline error. Fixed by excluding `/auth/*` requests from that
   handler.
2. The new `PUT /users/me/password`'s "wrong current password" case
   originally returned 401, which would have tripped that same interceptor
   for an already-logged-in user. Changed to 400 (the user IS
   authenticated; this is a request-validation failure, not a session
   issue).

Also added an `account_history` table + "Account history" card on the
Profile page: every display-name/email change is logged old→new, password
changes log only the date (never a value). See §7 item 5.

**Also done and committed:** §7 **Transaction edit/delete** (the last item
in §7 — all of §7 is now complete) plus three follow-up fixes/features on
the Transactions page found via user testing. See §7 item 1 for full detail
on all of these:
1. Added `Account.openingBalance` (immutable, set once at creation) so
   `account.balance` and every transaction's `runningBalance` are fully
   re-derived in true chronological (`occurredOn`, then `id`) order on every
   create/edit/delete, via a new `TransactionResource#recomputeAccountBalance`
   helper — replacing the old insertion-order-based math, which was subtly
   wrong for backdated transactions.
2. Fixed a client-side timezone bug: `new Date("yyyy-MM-dd")` parses as UTC
   midnight, which renders as the previous calendar day in timezones behind
   UTC — a transaction dated "today" was showing under "Yesterday." Fixed
   with a shared `frontend/src/utils/date.js#parseLocalDate` used everywhere
   `occurredOn` strings are turned into `Date` objects (`Transactions.jsx`
   and `Overview.jsx` both had the bug).
3. Added a "Current balance" stat to the Transactions page (real account
   balance, respects the account filter, unaffected by category/search —
   by design, confirmed with user) and changed each day-group's figure from
   "net sum for that day" to "balance as of that day." When a category
   filter is active, a second "`<category>` total" stat now also appears
   (net sum of the currently filtered rows) — this one *does* reflect
   search/account/range filters too, since it's explicitly a filtered
   subtotal rather than a real balance.

**Reference pattern for delete UIs** (see `[[project-accounts-pattern]]` in
memory): in-card/in-row swap to a "Delete X? This cannot be undone."
confirm panel (no `window.confirm`, no app-wide modal) using the `.btn-red`
style, and a pre-validation check before showing the confirm step at all
(e.g. `GET /categories/{id}/usage`) rather than attempting the delete and
showing an error after — skip the pre-check only when nothing could
possibly reference the row (Budget's and Transaction's case).

**Not started:** §7 is fully complete, and so is the recurrence/installments
feature below — nothing outstanding right now beyond §5's demo-login bug,
§6's backend gaps, and the new §8 item below (neither urgent).

## 8. Recurring-series tracking at the DB level (raised 2026-07-07, not started)

Today a repeat/installment purchase generates N independent `Transaction`
rows linked only by a cosmetic `seriesInfo` string (e.g. `"3/12"`) — there is
no `series_id`/group column anywhere. Consequence, confirmed with user:
editing or deleting one occurrence only ever touches that single row.
Deleting one leaves a gap in the `seriesInfo` numbering (e.g.
`1/12, 2/12, 4/12, 5/12...`) since nothing renumbers the rest, and there's
no "edit/delete this and all future occurrences" option.

If this is worth fixing later:
- Add a real `series_id` (e.g. a generated UUID or a self-referential FK to
  the first row) on `Transaction`, set at generation time in
  `TransactionResource#create`, so occurrences are actually queryable as a
  group instead of only sharing a display string.
- Decide the desired bulk behavior once tracked: renumber remaining
  `seriesInfo` labels after a delete, and/or add "delete this and all
  future" / "edit all remaining" affordances on the frontend.
- Not urgent — no one has hit this in practice yet, purely a known gap from
  how §-recurrence was deliberately kept simple (pre-generate flat rows, no
  scheduler, no series table — see the entry above).

**Done, not yet committed: Recurrence/installments** (requested 2026-07-07).
- Backend: `Transaction` gained `seriesInfo` (nullable String, e.g. `"3/12"`,
  display-only — no series/group table). `POST /transactions` now returns
  `List<Transaction>` instead of a single `Transaction` (frontend never
  consumed the return value beyond cache invalidation, so this was safe).
  `CreateTransactionRequest` gained `repeat` (`RepeatFrequency` enum: NONE/
  WEEKLY/MONTHLY/YEARLY/INSTALLMENTS) and `occurrences` (2-60, validated).
  Confirmed approach: pre-generate all occurrences upfront as real rows
  (no background `@Scheduled` job, no new dependency — `quarkus-scheduler`
  isn't in this project and adding it was explicitly deferred). WEEKLY/
  MONTHLY/YEARLY repeat the same amount each occurrence; INSTALLMENTS
  splits the total evenly (remainder cent(s) land on the last installment
  so the parts always sum back exactly). Each generated row is a normal
  transaction, editable/deletable with the §7 item 1 machinery already
  built — no bulk/series management exists, by design (kept simple).
- Frontend: "Repeat" select + conditional "Occurrences" input on the
  add-transaction form, with inline help text explaining what will be
  created. Each `txn-row` shows a `seriesInfo` badge (reusing the existing
  `.tag` class) when present, e.g. "3/12".

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

1. **Transactions** — [x] done, committed.
   - Backend: `Account` gained an immutable `openingBalance` field (set once
     at creation). `PUT`/`DELETE /transactions/{id}` added, both calling a
     new `recomputeAccountBalance()` helper that re-derives `account.balance`
     and every transaction's `runningBalance` from `openingBalance`, walking
     transactions in chronological (`occurredOn`, then `id`) order — not
     insertion order like the old `create()` did. `seed-data.sql` updated
     with `opening_balance` values for the demo accounts.
   - Frontend: pencil/trash icons on each `txn-row`, same in-row edit-form /
     confirm-panel pattern as the rest of the app. No pre-check before
     delete (nothing references a transaction, same as Budget's case).
   - Follow-ups from user testing: fixed a UTC/local timezone bug in day
     grouping (`frontend/src/utils/date.js#parseLocalDate`), added a
     "Current balance" stat + changed day-group totals to "balance as of
     that day" instead of a same-day net sum, and added a category-filtered
     total stat. See the note above for full detail.

2. **Budgets** — [x] done, awaiting user review/commit.
   - Backend: added `DELETE /budgets/{id}`.
   - Frontend: edit/delete icons on `budget-card` — pencil reopens the top
     "Set budget" form pre-filled with that category+limit (still upserts
     via the same endpoint), trash swaps to the in-card confirm panel.

3. **Accounts** — [x] done, committed (`d5aacaa`).
   - Backend: added `PUT /accounts/{id}` (name/institution/kind only —
     balance stays server-derived from transactions). `DELETE` now catches
     the FK-constraint case and returns 409 instead of a raw 500.
   - Frontend: edit/delete icon buttons on `account-card-lg`, in-card
     confirm panel, pre-validates via `TransactionsApi.listByAccount` before
     showing the confirm step (see delete-pattern note above).

4. **Categories** — [x] implemented, awaiting user review/commit.
   - Backend: added `PUT /categories/{id}`, `GET /categories/{id}/usage`
     (transaction + budget counts), `DELETE /categories/{id}` — blocks
     (409) if used by any transaction or budget rather than nulling out
     `category_id` on existing rows (budgets require a category —
     `Budget.category` is `optional = false` — so nulling wasn't an option
     there anyway, and blocking keeps both entities' delete behavior
     consistent).
   - Frontend: edit/delete rows in `Categories.jsx`, same in-row swap
     pattern as Accounts, pre-validates via the new `/usage` endpoint.

5. **User profile** (email, password, display name) — [x] done, awaiting
   user review/commit.
   - Backend: new `UserResource` — `PUT /users/me` (display name + email,
     uniqueness-checked like signup, re-issues the JWT since the token's
     `upn` is the email), `PUT /users/me/password` (requires current
     password via `BcryptUtil.matches`, 400 not 401 on mismatch). Extracted
     the duplicated JWT-issuing code out of `AuthResource` into
     `security/TokenService` since a second call site needed it.
   - Frontend: new `/profile` page + sidebar link, two panels (profile
     info, change password), same form pattern as everywhere else.
     `AuthContext` got `applySession()` to refresh the cached token/user
     after a profile save.
   - Bonus: `account_history` table + "Account history" card logging
     display-name/email changes (old→new) and password changes (date
     only) — see note above.

**Suggested build order:** Account edit/delete, Category edit/delete,
Budget delete, and User profile — [x] all four done, see above — leaving
only Transaction edit/delete, the trickiest one (running-balance
recomputation on delete/edit affects every later transaction on that
account).
</content>
