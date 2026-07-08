ALTER TABLE accounts ADD COLUMN payment_account_id BIGINT REFERENCES accounts(id);
