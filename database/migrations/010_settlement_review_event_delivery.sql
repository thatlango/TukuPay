-- Product-specific pull/ack delivery. Acknowledgements are immutable.
CREATE TABLE financial_event_acknowledgements (
 event_id UUID PRIMARY KEY REFERENCES financial_events(id),
 actor TEXT NOT NULL,
 acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_event_ack BEFORE UPDATE OR DELETE OR TRUNCATE ON financial_event_acknowledgements
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
CREATE INDEX financial_events_product_sequence ON financial_events(product_code,sequence);

-- Settlement proposals are not accounting entries. Approval for further
-- reconciliation is not permission to post money.
CREATE TABLE settlement_proposals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 country_code CHAR(2) NOT NULL REFERENCES countries(code),
 provider_code TEXT NOT NULL CHECK(provider_code IN ('mtn','airtel')),
 currency CHAR(3) NOT NULL,
 settlement_reference TEXT NOT NULL CHECK(length(settlement_reference) BETWEEN 1 AND 128),
 bank_reference TEXT CHECK(length(bank_reference) BETWEEN 1 AND 128),
 gross_minor BIGINT NOT NULL CHECK(gross_minor>0),
 fee_minor BIGINT NOT NULL CHECK(fee_minor>=0),
 net_minor BIGINT NOT NULL CHECK(net_minor>=0),
 submitted_by TEXT NOT NULL,
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(gross_minor-fee_minor=net_minor),
 UNIQUE(country_code,provider_code,settlement_reference)
);
CREATE TABLE settlement_proposal_reviews (
 proposal_id UUID PRIMARY KEY REFERENCES settlement_proposals(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED_FOR_RECONCILIATION','REJECTED')),
 reviewer TEXT NOT NULL,
 evidence_reference TEXT CHECK(length(evidence_reference) BETWEEN 1 AND 256),
 note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 1000),
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(decision<>'APPROVED_FOR_RECONCILIATION' OR evidence_reference IS NOT NULL)
);
CREATE TRIGGER immutable_settlement_proposal BEFORE UPDATE OR DELETE OR TRUNCATE ON settlement_proposals
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
CREATE TRIGGER immutable_settlement_review BEFORE UPDATE OR DELETE OR TRUNCATE ON settlement_proposal_reviews
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
CREATE FUNCTION verify_independent_settlement_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maker TEXT;
BEGIN
 SELECT submitted_by INTO STRICT maker FROM settlement_proposals WHERE id=NEW.proposal_id;
 IF lower(maker)=lower(NEW.reviewer) THEN RAISE EXCEPTION 'Independent review required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER independent_settlement_review BEFORE INSERT ON settlement_proposal_reviews
 FOR EACH ROW EXECUTE FUNCTION verify_independent_settlement_review();
-- Old direct posting path remains disabled until independent bank evidence,
-- human approval and finance-approved posting rules are implemented.
CREATE TRIGGER block_direct_settlement_record BEFORE INSERT ON settlements
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
