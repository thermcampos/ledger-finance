ALTER TABLE transactions ADD COLUMN transfer_peer_id BIGINT REFERENCES transactions(id);
