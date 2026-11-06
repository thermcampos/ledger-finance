-- Opt-in TOTP two-factor authentication (docs/adr/0003-two-factor-auth.md).
-- users.totp_secret is AES-GCM ciphertext (key from TOTP_ENCRYPTION_KEY), never the
-- plaintext secret. A secret can exist while totp_enabled is false: that's an
-- enrollment the user started but never confirmed with a first code, and it's inert.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time recovery codes, shown once at enrollment. Only the BCrypt hash is
-- stored, like passwords; used_at set on consumption so a code can't be replayed.
CREATE TABLE recovery_codes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at    TIMESTAMPTZ
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

-- The login challenge between a correct password and the JWT: the row exists only
-- after the password checks out, carries the brute-force budget (5 attempts, both
-- code types combined) and dies after 2 minutes or on success.
CREATE TABLE pending_logins (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token      VARCHAR(64) NOT NULL UNIQUE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX pending_logins_user_idx ON pending_logins (user_id);
