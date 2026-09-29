-- Optional projection target on budgets, and the marker on system-generated
-- budget projection rows (mirrors transactions.linked_card_id for card bills).
ALTER TABLE budgets ADD COLUMN account_id BIGINT REFERENCES accounts(id);
ALTER TABLE transactions ADD COLUMN linked_budget_id BIGINT REFERENCES budgets(id);
