-- Read-only API tokens for LLM access (ChatGPT GPT Actions). Only the SHA-256
-- hex of the token is stored; the plaintext is shown once at creation.
-- 'read-write' is reserved in the CHECK but not issued or implemented in v0.
CREATE TABLE api_tokens (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    scope        VARCHAR(20) NOT NULL CHECK (scope IN ('read', 'read-write')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);
