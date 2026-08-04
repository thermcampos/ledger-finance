ALTER TABLE transactions
    ADD COLUMN completed BOOLEAN,
    ADD COLUMN debit_authorized BOOLEAN;
