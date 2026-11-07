CREATE TABLE reconciliation_batch (
 id UUID PRIMARY KEY,
 request_key VARCHAR(100) NOT NULL UNIQUE,
 fingerprint VARCHAR(64) NOT NULL,
 account_label VARCHAR(100) NOT NULL,
 settlement_date DATE NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 payload TEXT NOT NULL
);
CREATE INDEX batch_created_idx ON reconciliation_batch(created_at);
