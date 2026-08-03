CREATE TABLE credit_card_bills (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id    BIGINT NOT NULL REFERENCES accounts(id),
    due_date      DATE NOT NULL,
    consolidated  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, due_date)
);

CREATE INDEX idx_credit_card_bills_account_due ON credit_card_bills(account_id, due_date);
