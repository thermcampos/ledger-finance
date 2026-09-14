# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Accounts page cards to display in this order: name, institution, balance and kind;
- Overview page accounts to display in the same order as above and balance descending;

```
Docker images
- ghcr.io/thermcampos/ledger-finance/frontend:v2026.09.14.7
```

---

### Added
- Light theme, with a Dark/Light toggle on the Profile page. Dark stays the
  default; the choice is stored per-device in `localStorage` and applied before
  first paint (no flash), on every page including the logged-out ones.
  `prefers-color-scheme` is deliberately ignored. Palette designed for WCAG AA
  contrast (`npm run check:contrast`), not inverted from dark.
- Vitest (first frontend test runner) — covers the theme module.

### Changed
- All colors in `main.scss` now flow through design tokens; the light palette
  and Bootstrap runtime overrides live in `frontend/src/styles/_themes.scss`.
  Reverses the former "dark mode only" design rule (see `docs/light-theme.md`).

## 2026-08-28

### Changed
- Due soon panel now display grouped accounts for better visibility.

```
# Docker images
- ghcr.io/thermcampos/ledger-finance/frontend:v2026.08.28.4
```

---

## 2026-08-26

### Changed
- Repo name on github and docker to match new username thermcampos.
- Docker images to push and pull from GHCR.
- Bumped all patch and minor deps in the frontend.

### Fixed
- Missing completed checkbox for transfers.

```
# Docker images
- ghcr.io/thermcampos/ledger-finance/frontend:v2026.08.26.3
- ghcr.io/thermcampos/ledger-finance/backend:v2026.08.26.3
```

## 2026-08-07

### Changed
- All deps at patch target bumped to latest. (build [633](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/633))
- All deps at minor target bumped to latest. (build [633](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/633))
- Scaled down the font-size for monthly totals and preditected in mobile. (build [633](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/633))

### Fixed
- Bug adding additional root element in scss causing error. (build [633](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/633))
- Bug in useEffect dependency causing page empty state not render for credit-bills. (build [633](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/633))
- Bug in installed PWA app on iOS not updating. (build [635](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/635))
- Mobile word-wrapping in transactions view for monthly totals. (build [641](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/actions/runs/641))

```bash
# Docker images
- thermcampos/ledger-frontend:v2026.08.06.170
```

---

## 2026-08-06

### Added
- Payment feature to credit card bills.
- Icon to display authorized or scheduled transactions in the due soon panel in Overview page.

### Changed
- When the current card bill is closed or consolidated, display the next bill automatically.
- Hide review button in credit-bills page when the bill is paid.

```bash
# Docker images
- thermcampos/ledger-frontend:v2026.08.06.164
- thermcampos/ledger-backend:v2026.08.06.162
```

---

## 2026-08-04

### Added
- Optional to flag transactions as completed (check icon) and debit authorized (shield icon).

### Changed
- In Overview page in the Due Soon panel only pending transactions are displayed now.

```bash
# Docker images
- thermcampos/ledger-frontend:v2026.08.04.150
- thermcampos/ledger-backend:v2026.08.04.149
```

---

## 2026-08-03

### Added
- Export button to the card-bills page.
- Option and button to review and consolidate credit card bills.

```bash
# Docker images
- thermcampos/ledger-frontend:v2026.08.03.146
- thermcampos/ledger-backend:v2026.08.03.145
```

---

## 2026-08-02

### Added
- Effect to scroll to form when adding transactions on mobile.

### Changed
- Due soon panel to include the next seven transactions regardless of the day.

### Fixed
- Transactions view on mobile.
- Login view on mobile, right size and paddings.

```bash
# Docker images
- thermcampos/ledger-frontend:v2026.08.02.141
```

---

## 2026-08-01

### Changed
- Budgets now survives months and years, allowing to set a budget for a category and have it applied to the next months.
- `.state-figure` now changes its size on mobile.
- Date format in the credit-bills page from 2026-08-1 to Aug 1.
- Categories in budgets page are now sorted alphabetically.
- All account dropdowns to display sorted accounts.

### Fixed
- Bug making transactions change place after editing.
- Bug making the page flash a white screen during page transition.
- Do not display credit-card transactions in the due soon panel in the overview page.

```bash
# Docker images
- thermcampos/ledger-backend:v2026.08.01.125
- thermcampos/ledger-frontend:v2026.08.01.133
```

---

## 2026-07-31

### Added
- Monthly totals in the transactions page.
- Click to load transactions in the budgets page.

### Changed
- Category and input filter in the transactions page now show the sum of all matching transactions.
- Overview and Transactions page to match the app styling fonts and grouping hero headers.

### Fixed
- Missing cancel button when editing a budget value.

```bash
# Docker images
- thermcampos/ledger-backend:v2026.07.31.110
- thermcampos/ledger-frontend:v2026.07.31.119
```

---

## 2026-07-14

### Added
- Scroll-linked header shrink effect in a progressive style. [Issue #4](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/4)
- Page transition on route change. [Issue #5](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/5)
- Sidebar active-link indicator now slide instead of snap. [Issue #6](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/6)
- Today and Next two days transactions in the overview page. [Issue #1](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/1)

### Changed
- Headers in all pages to scroll smoothier. [Issue #3](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/3).

### Fixed
- Apple and iOS PWA icon when installed at Home Screen. [Issue #2](https://lightroasted.vps-kinghost.net/thermcampos/ledger-finance/issues/2)

```bash
# Docker images
- docker.io/thermcampos/ledger-backend:v2026.07.14.?
- docker.io/thermcampos/ledger-frontend:v2026.07.14.?
```

---

## 2026-07-12

## Added
- Predicted balances for the next three months in the transactions page.
- Transfer feature between accounts (credit card not included).
- Percentage reached for budgets in the overview page.
- USD/BRL exchange rate in the overview page getting from BCB PTAX.

## Changed
- Build version link updated to follow app's styling.
- Credit Card bill projection to display an icon and proper category.
- Account and navigation bar in Transactions and Card Bills pages to stick when scrolling.
- Backend classes and packages, renamed to use record and simple MVC-based layers.

## Fixed
- Wrong order in the transactions page when multiple accounts were added.
- Amount spent in the budgets endpoint giving 500 when quering from DB.

### Docker images
- `docker.io/thermcampos/ledger-backend:v2026.07.12.104`
- `docker.io/thermcampos/ledger-frontend:v2026.07.12.102`

## frontend:v2026.07.11.87 & backend:v2026.07.11.86 - 2026-07-11

## Added
- Icons in the categories to improve viewing and usage.
- Pre-set of categories to help users get started.
- Linked transactions allowing to propagate changes or deletion.

## Changed
- Removed the accounts add card that not follows the app pattern.
- When adding a credit card, the user is redirected having the add form visible and selected.
- Normalized the Add Credit Card button across the app to stick to visual pattern.

## Fixed
- Credit card transactions can select the first bill to land the first record.

### Docker images
- `docker.io/thermcampos/ledger-backend:v2026.07.11.86`
- `docker.io/thermcampos/ledger-frontend:v2026.07.11.87`

## frontend:v2026.07.10.78 & backend:v2026.07.10.79 - 2026-07-10

## Added
- Feature to import transactions from CSV file.
- Anthropic LLM to read and parse PDFs allowing to import transactions.

### Docker images
- `docker.io/thermcampos/ledger-backend:v2026.07.10.79`
- `docker.io/thermcampos/ledger-frontend:v2026.07.10.78`

## frontend:v2026.07.10.74 & backend:v2026.07.10.70 - 2026-07-09

## Added
- Favicon for browser tab and in the side panel navbar.
- App version below the sign-out button.
- "Member since" tag in the profile page.
- Mobile responsiveness.

## Fixed
- Budgets logic with wrong values.

### Docker images
- `docker.io/thermcampos/ledger-backend:v2026.07.10.70`
- `docker.io/thermcampos/ledger-frontend:v2026.07.10.74`
