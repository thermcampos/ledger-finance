# 0002 — Transactional email via Resend REST, light-palette HTML

Status: **accepted** (2026-11-03)
Driven by: daily budget digest ([plan](../daily-digest.md))

## Context

The app has never sent email. The daily budget digest needs outbound email with a design that
still respects the ledger design language, inside a GraalVM native image.

## Decision

### Provider and transport

- **Resend**, called over **raw REST** (`POST https://api.resend.com/emails`) through a
  MicroProfile REST client (`ResendClient`, config key `resend-api`). No SDK — same reasoning as
  `AnthropicClient`: avoid native-image reflection/runtime surprises from third-party SDKs.
- Sending domain `ledger-finance.darkroasted.vps-kinghost.net` (DKIM/SPF/MX/DMARC records set
  2026-11-03). Sender: `Ledger <digest@ledger-finance.darkroasted.vps-kinghost.net>`.
- API key in Doppler (`RESEND_API_KEY`) → Terraform secret → backend env.
- Every send passes an `Idempotency-Key` derived from the logical event
  (e.g. `digest-{userId}-{yyyy-MM-dd}`), so retries never duplicate an email.
- `ledger.email.enabled=false` outside prod: the rendered plain-text body is logged instead of
  sent.

### Rendering

- **Qute** templates, each email with an HTML and a plain-text variant.
- **Light (paper) palette only.** Email clients force, invert or partially restyle dark
  backgrounds unpredictably; a navy email is the most likely to render broken. The app's
  dark-first identity applies to the app, not to email.
- **Colors come from `EmailPalette`** — Java constants mirroring the light values in
  `frontend/src/styles/_themes.scss`, with a keep-in-sync comment pointing there. This is an
  **accepted exception** to the "all colors come from the tokens" rule (the SCSS tokens are not
  reachable from the backend). If the light tokens change, `EmailPalette` changes in the same PR.
- Design rules that still hold: monetary figures in a monospace stack
  (`'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace`), right-aligned, tabular; no
  charts (progress bars are two-cell tables); hairline borders, no shadows; gold only for
  "Near limit". Fraunces is not used in email.

## Alternatives considered

- **SMTP (`quarkus-mailer`) to Resend's SMTP relay.** Works, but loses idempotency keys and
  structured error responses. Rejected.
- **Dark email matching the app.** Rejected for rendering reliability (see above).
- **Generating `EmailPalette` from SCSS at build time.** Correct but adds a cross-module build
  step for ~8 colors. Revisit if the palette starts drifting.

## Consequences

- One new external dependency at runtime (api.resend.com); failures are per-user and logged,
  never fatal to the app.
- Any future email reuses `ResendClient`, `EmailPalette` and the Qute layout.
