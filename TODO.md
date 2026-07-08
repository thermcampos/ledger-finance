# Ledger — Outstanding Work

## Status as of end of session (2026-07-08, latest session)

**Done, not yet committed: split credit cards out of Transactions.jsx onto
a new "Card Bills" page.** User found the Transactions page overwhelming —
a large fraction of it was credit-card-only machinery (bill prev/next
navigator, "Projected" section, "Amount owed" sign-flip, the Bill dropdown
on add/edit). Landed as two chunks:

1. New `frontend/src/pages/CardBills.jsx` (route `/card-bills`, its own
   sidebar entry after "Credit Cards"). Auto-selects the user's card (or
   shows a plain picker if they have more than one), navigates by actual
   bill due dates via chevrons (reusing `groupTransactionsByBill`/
   `nextBillFor` from `utils/creditCard.js`), shows that bill's total +
   due date, and lists just that bill's transactions with full add/edit/
   delete parity including the Bill-period override — no future-grey
   styling, no other filters. The Credit Cards dashboard's "View
   transactions" link now points here instead of into Transactions.
2. Stripped `Transactions.jsx` from 1244 → 888 lines: credit card accounts
   filtered out of `accounts` right after the query (cascades to the
   account dropdown, `txnQueries`, every downstream calc), then deleted
   `billOptionsFor`/`billOptionsWithCurrent`, `filterBillDueDate`,
   `billBalanceAsOf`, `isCreditCardFilter` sign-flip, `projectedCcDeduction`,
   `aggregateCreditCards`/`isCreditCardTxn`, `projectedBills`,
   `cardBillDates`/`defaultBillDueDate`/`stepBill`,
   `viewAccountTransactions`, `resetToDefaultView`, and both Bill
   dropdowns. Small added robustness: a stale `ledger:lastAccountId`
   pointing at a now-filtered-out credit card clears itself back to "All
   accounts" instead of silently showing an empty list.

Also fixed along the way: `utils/date.js#dueLabel` read "in -3 days" for
an overdue bill (never triggered before, since its only callers passed
future dates) — now "3 days ago"/"yesterday". Verified via a scratch
Playwright driver (`playwright` installed ad hoc into the scratchpad dir,
reusing the cached Chromium binary) — full add/edit/delete/navigate flow
on Card Bills, the dashboard deep link, and a regression pass confirming
normal (non-card) Transactions behavior and Overview were unaffected. No
console errors in any pass.

**Follow-up in the same session: credit card bills sync onto their linked
payment account as real transactions.** Splitting credit cards out of
Transactions.jsx also removed the old client-side "Projected" row, which
was the only way a linked checking account showed its upcoming card bill.
Rather than rebuild that (a side-channel projection that TODO.md's prior
entries show caused repeated double-counting/month-leakage bugs), the
user proposed materializing it: whenever a credit card's transactions
change, maintain one real `Transaction` per open bill on the card's
`paymentAccount`, dated on the bill's due date, holding that bill's total.

- Backend: new nullable `Transaction.linkedCard` FK
  (`V4__transaction_linked_card.sql`) marks a row as system-generated. New
  `CreditCardBillSyncService` (`com.ledger.transaction`,
  `@ApplicationScoped`) owns `recomputeAccountBalance` (moved out of
  `TransactionResource`, same algorithm, now has two callers) and
  `sync(Account card)` — the single entry point, safe to call
  unconditionally on any account. Groups the card's own transactions by
  effective due date (a Java port of `utils/date.js#nextDueDate` +
  `utils/creditCard.js#billDueDateFor`/`groupTransactionsByBill`), upserts
  one row per non-zero bill on the linked account, deletes any synced row
  whose date no longer matches or that's sitting on the wrong account
  (this is what makes a payment-account change self-correct with no
  special-casing). Called from `TransactionResource`'s create/update/
  delete and unconditionally at the end of `AccountResource#update`.
  `TransactionResource` rejects direct `PUT`/`DELETE` on a transaction
  with `linkedCard != null` (400).
- Frontend: `Transactions.jsx` renders a `linkedCard` row dashed, with a
  "Card bill" tag and a "View bill" link to Card Bills instead of edit/
  clone/delete icons. Everything else — amount, running balance, day
  grouping, today/future styling, CSV export, search/category filtering —
  needed zero new code, since these are ordinary rows returned by the
  same `GET /transactions/account/{accountId}` the page already calls.
  `CardBills.jsx` needed no changes (synced rows live on the payment
  account, never on the card itself).
- One bug found and fixed during verification: `CreditCardBillSyncService
  #sync` set `row.amount` *after* `row.persist()` for a newly-created row
  — IDENTITY-strategy entities insert immediately on `persist()` (can't
  defer for a generated id), so `amount` (NOT NULL) has to be set first.
  Fixed by assigning every field before `persist()`.

Verified via the same Playwright driver, fresh throwaway users each time:
linked card + checking, add a charge → dashed synced row with correct
amount/date and no edit/delete UI; a second charge updates the same row
(no duplicate); overriding the Bill dropdown to a different due date moves
the amount off the old date onto a new one; deleting the card transaction
removes the synced row and recomputes the checking balance; editing the
card to a different payment account moves the row (old account ends up
empty, new one gets it); direct `curl`-equivalent `PUT`/`DELETE` against a
synced transaction's id both return 400. No console or backend errors in
any pass.

`CLAUDE.md` updated: `Account.paymentAccount`'s Javadoc, the "Balance
math" bullet's file reference, and a new bullet documenting the sync
mechanism and why it replaced the client-side projection.

**Follow-up in the same session: "View bill" deep link + a StrictMode race
it exposed.** The "View bill" link on a synced row only ever opened Card
Bills on whatever bill it defaults to (next upcoming, or most recent past)
— clicking it from a future-dated bill row still required an extra manual
chevron click to actually reach that bill. Fixed by passing the row's own
`t.occurredOn` (already *is* the bill's due date — no separate bill-id
needed) as a new `?bill=` param, read by `CardBills.jsx` alongside the
existing `?account=`.

First attempt raced: two separate effects both decided what
`selectedBillDueDate` should be, and when the accounts/transactions
queries were already cached (e.g. bouncing back from Transactions), both
ran in the same pass reading the same stale empty value — whichever ran
second (the pre-existing billDates-reconciliation effect) won, silently
dropping the URL's bill back to the default. Merging them into one effect
"fixed" that pass but broke under `React.StrictMode` (active in
`main.jsx`), which double-invokes an effect in dev using the *same* stale
closure — a ref mutated in the first invocation made the second invocation
skip the "apply the URL bill" branch but still read the stale (pre-update)
`selectedBillDueDate`, falling through to the same reset. Only surfaced
with two or more real bills on the card, since with just one, "fallback"
and "correct" happened to be the same value — not caught by initial
Playwright verification, which always used fresh signups (nothing cached)
and single-bill cards.

Root-caused with temporary debug logging read back through the same
Playwright driver (`page.on('console')`), reproducing the exact two-bill
scenario. Real fix: decoupled "should the URL's bill be applied" from
`selectedBillDueDate` entirely (removed from the effect's dependency array
and its condition) — gated instead on a `userSteppedAway` ref that
`stepBill()` flips, so the URL-application logic is idempotent no matter
how many times React invokes it against stale data. Debug logging removed
before commit.

Verified: the two-real-bills repro now lands on the correct bill
immediately; the original warm-cache scenario still does too; chevron
stepping afterward is unaffected (doesn't fight the URL); no console
errors in any pass.

## Status as of end of session (2026-07-08, new session)

**Done, not yet committed: bill navigation in Transactions.jsx.** Follow-up
to the credit-card overhaul below, requested in a fresh session. The
"Showing {bill} only · View full history" chip was a one-way clear button
— once you switched to full history there was no way back to a specific
bill, and no way to browse *other* bills (e.g. the previous month's) at
all.

Made it a real toggle, plus prev/next navigation:
- New `groupTransactionsByBill`-derived `cardBillDates` memo — every bill
  (ascending due date) the currently-filtered credit card has ever had a
  transaction assigned to, drawn from its complete history (not whatever
  date range happens to be active), so navigation can reach bills outside
  the visible window.
- `stepBill('prev' | 'next')` moves `filterBillDueDate` to the adjacent
  entry in `cardBillDates`, always switching into an unbounded custom range
  (same as "View all" already did) so the date filter never hides the
  target bill. Chevrons disable at either end.
- The chip itself now toggles both ways: bill-scoped shows "Showing {bill}
  only · View full history" (click clears to full history); full-history
  shows "Viewing full history · Show bill" (click jumps to
  `defaultBillDueDate()` — the next upcoming bill if it's a real one,
  otherwise the most recent past bill).
- `billBalanceAsOf` (added in the prior session's 8th fix) already made
  "Amount owed" and day totals follow the bill filter — this now also
  updates correctly as you step between bills via the chevrons, not just
  via the initial "View all" click.

Verified via Playwright: a card with 3 bills (July/August/September, one
transaction each) — chevrons correctly disable at both ends, "Amount
owed" and the day total update at each step, full-history shows the real
$90 total across all three, and "Show bill" correctly returns to July (the
next upcoming bill relative to today).

**Follow-up in the same session: "Back to all transactions" button.** The
only way out of a bill/account drill-down was clearing the bill filter,
which just leaves you on that one card's full history — still not the
page's normal default view. Clicking "View full history" required a page
reload to get back to browsing normally. Added `resetToDefaultView()` —
clears every filter (account, category, search, range→'this-month',
custom dates, bill, month offset) and the remembered-account localStorage
entry — wired to a new "← Back to all transactions" button shown whenever
the bill navigator is visible (i.e. whenever `cardBillDates.length > 0`),
in both the bill-scoped and full-history states.

Verified via Playwright: from a bill-scoped view, clicking it returns to
"All accounts" / "This month" with the normal "Projected" section back,
no reload needed.

**Follow-up in the same session: flickering $0 "Projected" row.** User
noticed the projected credit-card bill sometimes showed $0 and sometimes
didn't appear at all. Root cause: `nextBillFor` (in `creditCard.js`)
returns a synthetic $0 placeholder — dated via `nextDueDate(dueDayOfMonth,
today)`, not tied to any real transaction — whenever a card has no
activity assigned to an upcoming bill yet. `projectedBills` then filtered
that placeholder by whether its date fell in the *currently viewed* month,
so it flickered in and out as `today` or the viewed month changed, with no
visible reason. Fixed by excluding non-positive amounts
(`p.amountOwed > 0`) from `projectedBills` — the placeholder never had
anything to actually project, so it's just dropped rather than shown as a
misleading $0 row. `nextBillFor` itself is untouched (Overview's per-card
tile intentionally still shows "$0, due in N days" for a card with no
activity — that's a fixed, always-one-row-per-card display with no
date-range filtering, so it doesn't have the same flicker problem).

Verified via Playwright: a linked card with zero transactions shows no
"Projected" row in June, July, or August (previously flickered depending
on the viewed month); adding a real $25 charge makes it appear correctly
with the real amount.

**Follow-up in the same session: Overview's "Credit card debt" didn't
match the per-card "next bill" tiles right below it.** User asked why the
top total showed $0 while a card's tile showed a real upcoming amount.
Root cause: the two figures used genuinely different logic —
`totalCardDebt` summed real debt *as of today* while excluding anything
dated in the future or explicitly tagged outside the current calendar
month (from the earlier "should consider only current month" fix), while
the per-card tiles use `nextBillFor`, which shows whichever bill is
chronologically next regardless of month or the transaction's date.
Confirmed with the user (their call, given the tension with the earlier
fix): the total should just be the sum of the tiles, always consistent by
construction. `totalCardDebt` now sums `nextBillFor(...).amountOwed` per
card directly — same function, same result as what's rendered below.
This does mean a transaction explicitly deferred to a future bill counts
toward the total again when it's that card's only/next open bill (no
longer zeroed out for not being "this month's" bill) — that's the
accepted tradeoff for the total always matching what's on screen.

Verified via Playwright: a card whose only transaction is a $80 charge
explicitly tagged to next month's bill now shows "$80.00" in both the top
total and its own tile (previously $0 vs $80 — the reported mismatch).

**Follow-up in the same session: Transactions page filter-card redesign.**
User found the filters card (search, account, category, range, Export all
crammed into one panel plus a second row of month/date controls)
cluttered and confusing. Restructured in `Transactions.jsx`:
- **New toolbar row** directly below the page header, above the balance
  panel: Account select + range mode select ("This month"/"Custom range")
  + either month chevrons/label or From–To date inputs inline, depending
  on mode — the two most important filters, always visible, no longer
  buried in a bordered card.
- **Search + Category** moved into a collapsible "More filters" panel
  (new `showMoreFilters` state), collapsed by default; shows a small
  "Active" tag next to the toggle when collapsed with a search term or
  category selected, so an active filter is never silently hidden.
- **Export** demoted to a small ghost button on the same low-emphasis row
  as the "More filters" toggle, right-aligned — no longer competing
  visually with the primary filters.
- All existing behavior preserved as-is: `filterBillDueDate` still clears
  on every account/range/month/date-range change, the credit-card bill
  navigator (chevrons + toggle + "Back to all transactions") still lives
  in the balance panel and works unchanged, and the "your real balance —
  not limited to..." disclaimer still appears correctly.

Verified via Playwright: default view shows the compact toolbar with
"More filters" collapsed and Export tucked to the side; toggling shows
search+category and the "Active" chip appears correctly when collapsed
with a filter set; switching to "Custom range" swaps in date inputs
inline; the credit-card bill navigator and new toolbar coexist correctly
(tested filtering to a card, stepping through "View all").

**Follow-up polish in the same session:** the range select still showed
the static label "This month" next to a separate "Jul 2026" span flanked
by chevrons — two elements doing one job. Merged them: the select's
"this-month" option now renders the live month label itself (e.g. "Jul
2026"), and the prev/next chevrons wrap the select directly instead of a
separate label — so it reads as one control, `< [Jul 2026 ▾] >`, that's
also still a real dropdown (selecting "Custom range" from it works exactly
as before). No behavior change, purely visual consolidation.

## Status as of end of session (2026-07-08)

**Done, not yet committed: Credit card overhaul** (requested 2026-07-08 via
`Credit-Card-Issues.md`, planned via plan mode, plan saved at
`/home/ricardo/.claude/plans/woolly-skipping-quasar.md`). Landed as 4 chunks,
each independently reviewable/committable:

1. **`Transaction.billDueDate`** (backend) — new nullable `LocalDate` column
   (`V2__transaction_bill_due_date.sql`), settable/clearable via
   `CreateTransactionRequest`/`UpdateTransactionRequest`. Display/grouping tag
   only, same spirit as `seriesInfo` — never read by
   `recomputeAccountBalance`. For repeat/installment transactions the
   override is only applied to the batch's semantics correctly: every
   generated row gets `billDueDate = null` regardless of what was sent
   (a fixed date copied onto every installment would be wrong), verified via
   curl.
2. **Bill dropdown + shared util** (frontend) — new
   `frontend/src/utils/creditCard.js` (`billDueDateFor`,
   `groupTransactionsByBill`, `nextBillFor`), the single source of truth for
   "what bill is this transaction in" / "what's the next bill", replacing
   the old computed-only grouping in `Transactions.jsx`. Add/edit transaction
   forms show a "Bill" dropdown (3 upcoming due dates) when the account is a
   credit card with `dueDayOfMonth` set — solves "a purchase made after the
   statement effectively closes should land on next month's bill, not this
   month's." Only shown for non-repeating transactions (matches the backend
   scope limit). Verified end-to-end in browser: overriding to "Aug 10 bill"
   correctly moved the "Credit card bills" aggregate from Jul 10 to Aug 10.
3. **Overview redesign** — Total Balance now sums only CHECKING/SAVINGS
   (excludes INVESTMENT and CREDIT_CARD, confirmed with user); a second
   figure shows total credit-card debt. Credit card accounts get their own
   "Credit cards" section below the regular accounts grid, showing each
   card's **next bill** (amount + due date), not just current balance.
4. **`Account.paymentAccount` + projected bill row** — CREDIT_CARD accounts
   can link a CHECKING/SAVINGS "payment account"
   (`V3__account_payment_account.sql`, validated in
   `AccountResource#validatePaymentAccount`: must be CREDIT_CARD-only,
   can't self-reference, target must be CHECKING/SAVINGS owned by the same
   user). In Transactions, viewing that linked checking account (or "All
   accounts") now shows a dashed, read-only "Projected" row — "Credit card
   bill — {card name}" — for the card's next bill. It's not a real
   `Transaction` (no id, no edit/delete), and only affects the *projected/
   future* balance stat (via a new `projectedCcDeduction` applied solely to
   `futureBalanceRaw`), never the real `currentBalanceTotal`/
   `balanceAsOfDay`. Verified in browser: Checking's real "Current balance"
   stayed $0 while its July-end projected balance correctly showed -$75.50
   matching the pending card bill.

Verified via curl (backend validation: 400s for non-CC `paymentAccountId`,
CREDIT_CARD/INVESTMENT target, self-reference) and via a full Playwright
browser smoke test (signup → create linked checking+card → add transaction
with bill override → check Overview/Transactions render correctly), no
console errors. No automated test suite exists in this repo, so this was the
verification path (same as prior chunks).

**Follow-up fixes found via user testing (2026-07-08, same session), both in
`Transactions.jsx`:**
1. **Bill leakage across months.** `creditCardBillGroups` ("Credit card
   bills" aggregate) grouped by each transaction's assigned bill due date,
   but never checked that due date actually fell within the currently
   viewed month — so a transaction dated *this* month but tagged (via the
   new Bill dropdown, or a natural due-day rollover) to *next* month's bill
   would "leak" that future due date into the current month's view,
   confusingly. Pre-existing behavior before this session's work, but the
   new per-transaction Bill override made it much easier to trigger. Fixed
   by having `isAggregatedCreditCardTxn` also check the assigned bill's due
   date against the active date-range filter — when a transaction's bill
   falls outside the viewed range, it now falls through to the normal
   per-day list on its real `occurredOn` date instead of either leaking or
   disappearing.
2. **Double-counted projected balance in "All accounts."** The projected
   future-balance deduction (added for the checking↔card link) was applied
   per-account inside the "All accounts" reduce, but summing it there
   double-counts the same debt: once as the checking account's projected
   payment, again as the card's own real (already-negative) balance, which
   never actually moves since no real payment transaction is recorded.
   Fixed by only applying the deduction when a single linked checking/
   savings account is the active filter — the "All accounts" net total no
   longer applies it at all (a card's real balance already reflects the
   debt; there's nothing to project there).

Re-verified all scenarios via Playwright after both fixes: month-scoped
"Credit card bills"/"Projected" sections, month navigation to the bill's due
month, and the "All accounts" future-balance figure no longer doubling.

**Third + fourth follow-up fixes (2026-07-08, same session): Overview's
"Credit card debt" total, in two passes — the first pass introduced a
regression the second pass had to correct.**

*Pass 1:* `totalCardDebt` summed each card's real, all-time balance
(`accountBalances`), which includes every charge ever made regardless of
which bill it's tagged to — so a transaction dated this month but assigned
(via the Bill dropdown) to *next* month's bill was still inflating this
month's total. First fix: sum only the bill group (via
`groupTransactionsByBill`) whose due date falls in the current calendar
month.

*Regression this introduced:* the "Bill" dropdown always shows *some*
selected value (defaulting to the natural next due date) and the create/
edit forms were submitting that value unconditionally — so even a normal
transaction the user never touched the dropdown for got a non-null
`billDueDate` persisted. Once the due day for a cycle has already passed
(e.g. due day 3, transaction dated the 8th), the *natural* rollover lands
next month — meaning ordinary, just-today expenses were silently excluded
from "Credit card debt" too, which is what surfaced as "not considering an
expense in today's date."

*Root-cause fix (pass 2):* `Transactions.jsx`'s `handleSubmit` and
`handleEditSubmit` now only send `billDueDate` when it actually differs
from the freshly-computed natural default for that `occurredOn` — i.e. only
when the user *genuinely* overrode it. Left at the default, `billDueDate`
stays `null`, exactly like before the Bill dropdown existed.
`Overview.jsx`'s `totalCardDebt` was correspondingly simplified: walk each
card's transactions from `openingBalance`, excluding only (a) future-dated
ones (`occurredOn > today`, same as the existing real-balance convention)
and (b) ones with an *explicit* `billDueDate` outside the current month —
natural rollover alone no longer excludes anything. The per-card figure in
"Credit cards" is unchanged (still shows the next bill regardless of
month).

Verified via Playwright, three scenarios: (1) explicit override to next
month → correctly excluded from the total; (2) ordinary today-dated charge
on a card whose due day already passed this cycle (natural rollover, no
override) → correctly included; (3) a same-month natural bill → still
counts as before. All three consistent with no regressions.

**Fifth follow-up fix (2026-07-08, same session): `Transactions.jsx`'s "All
accounts" balance totals and per-row visibility for credit cards.** Two
related gaps, both in the "All accounts" view:
1. `currentBalanceTotal`/`balanceAsOfDay`/`futureBalanceRaw` summed *every*
   account including credit cards, so a card's debt was netted directly
   into "Current balance" — inconsistent with Overview's Total Balance,
   which had already been scoped to checking/savings only. Fixed by
   introducing the same `liquidAccounts` (CHECKING + SAVINGS) restriction
   for all three "All accounts" aggregates; filtering to one specific
   account (including a credit card directly) is unaffected.
2. A credit card transaction whose bill fell *outside* the viewed range
   was falling through to the normal per-day list (from the earlier
   "bill leakage" fix) — but credit card transactions should never appear
   as individual rows in "All accounts," only via "Credit card bills."
   Split the old combined `isAggregatedCreditCardTxn` into `isCreditCardTxn`
   (a plain kind check, used to unconditionally exclude CC transactions
   from the per-day list) and kept the due-date-range check scoped to just
   `creditCardBillGroups` — so a transaction whose bill is out of range now
   simply doesn't appear anywhere in that view (not the day list, not the
   bill aggregate) rather than leaking into the day list.

Verified via Playwright with checking + linked credit card: "All accounts"
Current balance now shows the checking-only total (matches Overview's Total
Balance), the card's transaction appears only under "Credit card bills" (not
as a day-list row), and filtering directly to the card still shows its own
rows normally (unaffected).

**Sixth follow-up fix (2026-07-08, same session): duplicate bill sections
in `Transactions.jsx`.** The fifth fix's `creditCardBillGroups` (real, old
"Credit card bills" section, transaction-derived) and `projectedBills` (new
"Projected" section, `nextBillFor`-derived) had converged to show the same
thing for any *linked* card — both scoped to bills due within the viewed
range — so a linked card's bill rendered twice. Merged into one section:
`creditCardBillGroups` is gone; `projectedBills` now covers every credit
card with a due day set when viewing "All accounts" (previously only
cards with a linked payment account), and just the card(s) linked to the
active account when filtering to one specific checking/savings account
(unchanged from before). Added the "View all" button (previously only on
the old section) to the merged "Projected" rows.

Verified via Playwright with one linked and one unlinked credit card: "All
accounts" shows a single row per card (both linked and unlinked covered,
each with "View all"), and filtering to the linked card's checking account
narrows to just that card's bill, dropping the unrelated unlinked one.

**Seventh follow-up fix (2026-07-08, same session, pre-existing bug):
"View all" on a projected bill loaded the account's full history instead
of just that bill.** `viewAccountTransactions` only ever set an unbounded
custom date range — fine for the original "View transactions" link (full
history by design), but wrong for a specific bill row, since a bill is
defined by `billDueDateFor`, not by an `occurredOn` range (an explicitly
overridden transaction can be dated in a totally different month than its
assigned bill, so no date-range filter could isolate it correctly anyway).
Added a new `filterBillDueDate` state that filters `filteredFlat` by
`billDueDateFor(account, t)` equality rather than by date range.
`viewAccountTransactions` now takes an optional `billDueDate` param (passed
from the "View all" button as `p.dueDate`) that sets this alongside the
account filter. Cleared automatically whenever account, range, month, or
custom-date-range controls are touched directly (search/category are
left alone — narrowing within a bill still makes sense); a small chip
("Showing {date} bill only · View full history") shows near the balance
stat when active, doubling as the way to clear it manually.

Verified via Playwright: two charges on the same card, same date, one
tagged to July's bill and one to August's — "View all" on the (single,
soonest) projected row now shows only the July-tagged charge, and "View
full history" restores both.

**Eighth follow-up fix (2026-07-08, same session): the "Amount owed" stat
(and day-heading totals) still showed the card's full real balance while
a specific bill was selected, instead of just that bill's total.** Unlike
the category/search filters — which deliberately leave "Current balance"/
"Amount owed" as the real, unfiltered figure (a longstanding, confirmed
design decision) — selecting a specific bill via "View all" is a genuine
scope change, so the balance stat needs to follow it. Added
`billBalanceAsOf(account, dueDateIso, cutoffDate)`, summing just that
bill's transactions (via `billDueDateFor`) up to a cutoff date, and used it
in place of `accountBalanceAsOf` for both `currentBalanceTotal` and
`balanceAsOfDay` whenever `filterBillDueDate` is set. The "your real
balance — not limited to..." disclaimer is now shown only for category/
search (not for the bill filter, since the balance genuinely is limited to
the bill in that case — showing the disclaimer would be misleading).

Verified via Playwright: with a $20 July-bill charge and a $35
August-tagged charge on the same card (same day, $55 real balance),
"View all" on the July bill now shows "Amount owed: $20.00" (matching the
filtered list and day total) instead of the card's full $55.

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
