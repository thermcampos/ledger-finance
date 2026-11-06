# 0003 — Two-factor authentication: opt-in TOTP with pending-login challenges

Status: **accepted** (2026-11-06)

## Context

The app holds real financial data behind a single password + 7-day JWT. A second factor was
added for login. Constraints: GraalVM native image, no scheduled JVM jobs (ADR-0001), email
already available via Resend (ADR-0002).

## Decision

### Factor: TOTP only

RFC 6238, SHA-1 / 6 digits / 30s step / ±1 step window — the authenticator-app defaults, so
Aegis, 1Password and Google Authenticator all work. **Hand-rolled** (`security/TotpService`,
~40 lines of HmacSHA1 + dynamic truncation, unit-tested against the RFC 6238 Appendix B
vectors) rather than a dependency: one less library to carry through the native build. The QR
code is an `otpauth://totp/Ledger:<email>` URI generated backend-side and rendered client-side
(`qrcode` npm package) — no backend image generation.

No SMS (paid, SIM-swappable) and no email-code fallback (email compromise already implies
password reset — it wouldn't be a second factor).

### Opt-in, two-step enrollment

Per-user opt-in from the Profile page, never forced. `POST /users/me/2fa/setup` writes a secret
that is **inert** (`totp_enabled` stays false, so login ignores it) until
`POST /users/me/2fa/enable` verifies a first code and returns 8 recovery codes, shown once. A
new setup attempt simply overwrites the unconfirmed secret — no pending-secret state or cleanup.

### Secret encryption at rest

`users.totp_secret` is **AES-GCM ciphertext** (`security/SecretEncryptionService`), key from
`TOTP_ENCRYPTION_KEY` (32 bytes Base64, Doppler `prd` → Terraform secret). A database or backup
leak must not hand out working second factors. Blank key: prod fails fast at startup; dev/test
get an ephemeral key with a warning (local data is disposable). Key rotation is out of scope.

### Login becomes two-phase

`POST /auth/login` with a correct password on a 2FA-enabled account returns **200** with
`{status: "TWO_FACTOR_REQUIRED", pendingToken}` — not 401, because the credentials were valid
and the frontend reads 401 as "session dead". The pending token is an **opaque 256-bit random
string** referencing a `pending_logins` row — deliberately not a JWT, because the challenge must
be revocable. `POST /auth/login/2fa` (permitAll, like `/auth/login` — the client has no JWT yet;
the pending token *is* the credential) exchanges token + code for the real JWT.

The challenge row enforces the brute-force budget: **2-minute TTL, 5 attempts** shared by TOTP
and recovery codes, deleted on success, exhaustion, or expiry; expired rows are purged
opportunistically on login (no CronJob — the table stays tiny). `TwoFactorService` methods are
`dontRollbackOn = WebApplicationException` so a rejected code still **commits its attempt
increment** — otherwise the budget would never drain.

### Recovery codes

8 one-time codes (`XXXX-XXXX-XXXX`, unambiguous alphabet), **BCrypt-hashed** like passwords, so
a database leak doesn't leak working codes. Consuming one sets `used_at` and triggers a
notification email. Regeneration atomically replaces the whole set. There is deliberately no
email-based recovery.

### Security-event emails

2FA enabled / disabled / codes regenerated / a recovery code was used → email via the existing
`EmailService` (one parameterized Qute template pair, `email/security-event.*`, light palette).
The out-of-band tripwire for account-security changes. A send failure is logged, never blocks
the operation. No email on every login — daily noise trains users to ignore real alerts.

### Disabling requires a factor

`DELETE /users/me/2fa` requires a current TOTP or recovery code, so a stolen password session
alone can't strip the account's protection.

### Frontend

The challenge is an **inline second step in `Login.jsx`**; the pending token lives only in
component state (never localStorage, where it would be XSS-readable challenge-replay material).
A page refresh simply restarts sign-in. `totpEnabled` rides the `/users/me` DTO so Profile
renders its 2FA section without a second request.

## Consequences

- Prod needs `TOTP_ENCRYPTION_KEY` in Doppler before deploy, or the backend refuses to boot.
- `V21__two_factor_auth.sql` adds `users.totp_secret`/`totp_enabled` + `recovery_codes` +
  `pending_logins`.
- `/auth/login/2fa` joins the JWT-permit public paths in `application.properties`.
- Signup and login responses share the widened `LoginResponse` shape (`status` discriminator);
  the frontend was updated in the same change.
