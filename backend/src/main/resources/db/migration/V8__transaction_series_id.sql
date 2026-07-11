ALTER TABLE transactions ADD COLUMN series_id VARCHAR(36);
CREATE INDEX idx_transactions_series_id ON transactions (series_id) WHERE series_id IS NOT NULL;
