ALTER TABLE reconciliation_batch ADD COLUMN report_snapshot TEXT;
CREATE TABLE exception_review (
 id UUID PRIMARY KEY,
 batch_id UUID NOT NULL REFERENCES reconciliation_batch(id),
 reference VARCHAR(80) NOT NULL,
 review_status VARCHAR(20) NOT NULL,
 owner_name VARCHAR(100) NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL,
 CONSTRAINT unique_review_reference UNIQUE(batch_id, reference)
);
CREATE TABLE review_event (
 id UUID PRIMARY KEY,
 review_id UUID NOT NULL REFERENCES exception_review(id),
 actor_name VARCHAR(100) NOT NULL,
 event_status VARCHAR(20) NOT NULL,
 owner_name VARCHAR(100) NOT NULL,
 reason VARCHAR(40) NOT NULL,
 note VARCHAR(2000) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX review_batch_idx ON exception_review(batch_id);
CREATE INDEX event_review_idx ON review_event(review_id, created_at);
