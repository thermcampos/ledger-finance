ALTER TABLE credit_card_bills
    ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN payment_date DATE,
    ADD COLUMN payment_account_id BIGINT REFERENCES accounts(id),
    ADD COLUMN payment_transaction_id BIGINT REFERENCES transactions(id);
