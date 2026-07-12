# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## frontend:v2026.07.12.? & backend:v2026.07.12.? - 2026-07-12

## Added
- Predicted balances for the next three months in the transactions page.

## Changed
- Build version link updated to follow app's styling.
- Credit Card bill projection to display an icon and proper category.

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
- `docker.io/rmcampos/ledger-backend:v2026.07.11.86`
- `docker.io/rmcampos/ledger-frontend:v2026.07.11.87`

## frontend:v2026.07.10.78 & backend:v2026.07.10.79 - 2026-07-10

## Added
- Feature to import transactions from CSV file.
- Anthropic LLM to read and parse PDFs allowing to import transactions.

### Docker images
- `docker.io/rmcampos/ledger-backend:v2026.07.10.79`
- `docker.io/rmcampos/ledger-frontend:v2026.07.10.78`

## frontend:v2026.07.10.74 & backend:v2026.07.10.70 - 2026-07-09

## Added
- Favicon for browser tab and in the side panel navbar.
- App version below the sign-out button.
- "Member since" tag in the profile page.
- Mobile responsiveness.

## Fixed
- Budgets logic with wrong values.

### Docker images
- `docker.io/rmcampos/ledger-backend:v2026.07.10.70`
- `docker.io/rmcampos/ledger-frontend:v2026.07.10.74`
