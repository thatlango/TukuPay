-- Financial core release candidate. Refuse historical data rather than silently
-- changing its accounting or transaction semantics. Legacy adoption needs review.
LOCK TABLE payment_intents,payout_requests,provider_transactions,provider_payout_transactions,
  journal_entries,ledger_postings,settlements IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM payment_intents) OR EXISTS(SELECT 1 FROM payout_requests)
    OR EXISTS(SELECT 1 FROM provider_transactions) OR EXISTS(SELECT 1 FROM provider_payout_transactions)
    OR EXISTS(SELECT 1 FROM journal_entries) OR EXISTS(SELECT 1 FROM ledger_postings)
    OR EXISTS(SELECT 1 FROM settlements) THEN
    RAISE EXCEPTION 'Financial core migration requires an empty database; review legacy migration separately';
  END IF;
END $$;

CREATE UNIQUE INDEX one_collection_dispatch_per_intent ON provider_transactions(payment_intent_id);
CREATE UNIQUE INDEX one_payout_dispatch_per_intent ON provider_payout_transactions(payout_request_id);

-- A transaction's financial details cannot be changed after initial persistence.
CREATE FUNCTION protect_financial_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','updated_at','approved_by','approved_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at','approved_by','approved_at']) THEN
    RAISE EXCEPTION 'Financial intent is immutable';
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='payment_intents' THEN
    IF (OLD.status='CREATED' AND NEW.status IN ('PENDING','FAILED','CANCELLED','EXPIRED'))
       OR (OLD.status='PENDING' AND NEW.status IN ('SUCCESSFUL','FAILED','CANCELLED','EXPIRED')) THEN RETURN NEW; END IF;
  ELSE
    IF (OLD.status='APPROVAL_REQUIRED' AND NEW.status IN ('APPROVED','CANCELLED'))
       OR (OLD.status='APPROVED' AND NEW.status IN ('PENDING','CANCELLED'))
       OR (OLD.status='PENDING' AND NEW.status IN ('SUCCESSFUL','FAILED','CANCELLED')) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Invalid financial state transition';
END $$;
CREATE TRIGGER protect_collection BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION protect_financial_intent();
CREATE TRIGGER protect_payout BEFORE UPDATE ON payout_requests FOR EACH ROW EXECUTE FUNCTION protect_financial_intent();

-- Journals are created and populated in one database transaction; no subsequent
-- append, modification or deletion. Use separately authorized compensating journals.
ALTER TABLE journal_entries ADD COLUMN creation_transaction BIGINT NOT NULL DEFAULT txid_current();
CREATE FUNCTION reject_financial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable financial record'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE OR TRUNCATE ON journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
CREATE TRIGGER immutable_posting BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_postings
  FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();

CREATE FUNCTION guard_new_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j journal_entries%ROWTYPE; a ledger_accounts%ROWTYPE;
BEGIN
  SELECT * INTO STRICT j FROM journal_entries WHERE id=NEW.journal_entry_id;
  SELECT * INTO STRICT a FROM ledger_accounts WHERE id=NEW.ledger_account_id;
  IF j.creation_transaction<>txid_current() OR a.currency IS DISTINCT FROM j.currency
     OR a.country_code IS DISTINCT FROM j.country_code THEN
    RAISE EXCEPTION 'Posting must belong to a new same-scope journal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_posting BEFORE INSERT ON ledger_postings FOR EACH ROW EXECUTE FUNCTION guard_new_posting();
CREATE FUNCTION guard_journal_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.creation_transaction<>txid_current() THEN RAISE EXCEPTION 'Invalid journal creation transaction'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_journal BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION guard_journal_creation();

CREATE FUNCTION protect_ledger_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'name') IS DISTINCT FROM (to_jsonb(OLD)-'name') THEN
    RAISE EXCEPTION 'Ledger account identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_account_identity BEFORE UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION protect_ledger_account_identity();

CREATE FUNCTION validate_new_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j_id UUID; n BIGINT; d NUMERIC; c NUMERIC;
BEGIN
  j_id:=NEW.id;
  SELECT count(*),coalesce(sum(amount_minor) FILTER (WHERE side='DEBIT'),0),
    coalesce(sum(amount_minor) FILTER (WHERE side='CREDIT'),0)
  INTO n,d,c FROM ledger_postings WHERE journal_entry_id=j_id;
  IF n<2 OR n>10000 OR d<=0 OR d<>c THEN RAISE EXCEPTION 'Journal is not balanced'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal_at_commit AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_new_journal();

-- Durable event record; no delivery endpoint or worker is enabled by this migration.
CREATE TABLE financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK(schema_version=1),
  kind TEXT NOT NULL CHECK(kind IN ('collection','payout')),
  transaction_id UUID NOT NULL,
  product_code TEXT NOT NULL,
  status TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kind,transaction_id,status)
);
CREATE TRIGGER immutable_financial_event BEFORE UPDATE OR DELETE OR TRUNCATE ON financial_events
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
CREATE FUNCTION capture_financial_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.status=NEW.status THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO financial_events(kind,transaction_id,product_code,status,currency,amount_minor)
  VALUES(CASE WHEN TG_TABLE_NAME='payment_intents' THEN 'collection' ELSE 'payout' END,
    NEW.id,NEW.product_code,NEW.status,NEW.currency,NEW.amount_minor);
  RETURN NEW;
END $$;
CREATE TRIGGER collection_events AFTER INSERT OR UPDATE ON payment_intents
 FOR EACH ROW EXECUTE FUNCTION capture_financial_event();
CREATE TRIGGER payout_events AFTER INSERT OR UPDATE ON payout_requests
 FOR EACH ROW EXECUTE FUNCTION capture_financial_event();
