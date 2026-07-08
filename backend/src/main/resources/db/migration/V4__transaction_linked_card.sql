ALTER TABLE transactions ADD COLUMN linked_card_id BIGINT REFERENCES accounts(id);
