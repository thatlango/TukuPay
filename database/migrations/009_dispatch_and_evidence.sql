-- Durable reservation and minimal success evidence. A reservation is not proof
-- that a provider received a request. Never automatically replay an ambiguous write.
CREATE TABLE financial_dispatch_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK(kind IN ('collection','payout')),
  transaction_id UUID NOT NULL,
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  provider_reference TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'RESERVED' CHECK(phase IN ('RESERVED','ATTEMPTING','OBSERVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempted_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  UNIQUE(kind,transaction_id),
  UNIQUE(kind,provider_market_id,provider_reference)
);
CREATE FUNCTION reserve_financial_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='provider_transactions' THEN
   INSERT INTO financial_dispatch_records(kind,transaction_id,provider_market_id,provider_reference)
   VALUES('collection',NEW.payment_intent_id,NEW.provider_market_id,NEW.provider_reference);
 ELSE
   INSERT INTO financial_dispatch_records(kind,transaction_id,provider_market_id,provider_reference)
   VALUES('payout',NEW.payout_request_id,NEW.provider_market_id,NEW.provider_reference);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reserve_collection_dispatch AFTER INSERT ON provider_transactions
 FOR EACH ROW EXECUTE FUNCTION reserve_financial_dispatch();
CREATE TRIGGER reserve_payout_dispatch AFTER INSERT ON provider_payout_transactions
 FOR EACH ROW EXECUTE FUNCTION reserve_financial_dispatch();

CREATE TABLE financial_success_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK(kind IN ('collection','payout')),
  transaction_id UUID NOT NULL,
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  provider_reference TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('provider_financial_id','provider_reference','simulator_reference')),
  evidence_id TEXT NOT NULL CHECK(length(evidence_id) BETWEEN 1 AND 256),
  response_sha256 TEXT NOT NULL CHECK(response_sha256 ~ '^[a-f0-9]{64}$'),
  amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  currency CHAR(3) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kind,transaction_id),
  UNIQUE(kind,provider_market_id,evidence_type,evidence_id)
);
CREATE TRIGGER immutable_success_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON financial_success_evidence
 FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();

-- The service validates authoritative status evidence before setting SUCCESSFUL.
-- Capture the first accepted observation, not the later mutable response record.
CREATE FUNCTION record_success_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k TEXT; tid UUID; amount BIGINT; curr CHAR(3); rail TEXT; evidence TEXT; evidence_kind TEXT; runtime TEXT;
BEGIN
  IF NEW.normalized_status<>'SUCCESSFUL' OR OLD.normalized_status='SUCCESSFUL' THEN RETURN NEW; END IF;
  IF NEW.response_payload IS NULL OR jsonb_typeof(NEW.response_payload)<>'object' THEN
    RAISE EXCEPTION 'Success evidence required';
  END IF;
  IF TG_TABLE_NAME='provider_transactions' THEN
    k:='collection'; tid:=NEW.payment_intent_id;
    SELECT amount_minor,currency INTO STRICT amount,curr FROM payment_intents WHERE id=tid;
  ELSE
    k:='payout'; tid:=NEW.payout_request_id;
    SELECT amount_minor,currency INTO STRICT amount,curr FROM payout_requests WHERE id=tid;
  END IF;
  SELECT provider_code INTO STRICT rail FROM provider_markets WHERE id=NEW.provider_market_id;
  SELECT environment INTO STRICT runtime FROM financial_environment_binding;
  IF runtime='simulator' THEN
    IF NEW.response_payload->>'simulated' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Simulator evidence required'; END IF;
    evidence:=NEW.response_payload->>'providerReference'; evidence_kind:='simulator_reference';
    IF evidence IS DISTINCT FROM NEW.provider_reference THEN RAISE EXCEPTION 'Reference mismatch'; END IF;
  ELSIF rail='mtn' THEN
    evidence:=NEW.response_payload->>'financialTransactionId'; evidence_kind:='provider_financial_id';
  ELSE
    -- Airtel authoritative financial ID contract remains unconfirmed.
    evidence:=coalesce(NEW.response_payload#>>'{data,transaction,id}',NEW.response_payload#>>'{transaction,id}');
    evidence_kind:='provider_reference';
    IF evidence IS DISTINCT FROM NEW.provider_reference THEN RAISE EXCEPTION 'Reference mismatch'; END IF;
  END IF;
  IF evidence IS NULL OR length(trim(evidence))=0 THEN RAISE EXCEPTION 'Missing evidence identity'; END IF;
  INSERT INTO financial_success_evidence(kind,transaction_id,provider_market_id,provider_reference,evidence_type,
    evidence_id,response_sha256,amount_minor,currency)
  VALUES(k,tid,NEW.provider_market_id,NEW.provider_reference,evidence_kind,evidence,
    encode(digest(NEW.response_payload::text,'sha256'),'hex'),amount,curr);
  RETURN NEW;
END $$;
CREATE TRIGGER collection_success_evidence AFTER UPDATE ON provider_transactions
 FOR EACH ROW EXECUTE FUNCTION record_success_evidence();
CREATE TRIGGER payout_success_evidence AFTER UPDATE ON provider_payout_transactions
 FOR EACH ROW EXECUTE FUNCTION record_success_evidence();

-- Success cannot commit without both the corresponding evidence and journal.
CREATE FUNCTION verify_success_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k TEXT; jt TEXT; j UUID; total NUMERIC;
BEGIN
  IF NEW.status<>'SUCCESSFUL' THEN RETURN NULL; END IF;
  k:=CASE WHEN TG_TABLE_NAME='payment_intents' THEN 'collection' ELSE 'payout' END;
  jt:=CASE WHEN k='collection' THEN 'PAYMENT_COLLECTION' ELSE 'PAYOUT_DISBURSEMENT' END;
  IF NOT EXISTS(SELECT 1 FROM financial_success_evidence e WHERE e.kind=k AND e.transaction_id=NEW.id
    AND e.amount_minor=NEW.amount_minor AND e.currency=NEW.currency) THEN RAISE EXCEPTION 'Verified evidence missing'; END IF;
  SELECT id INTO j FROM journal_entries WHERE reference_type=jt AND reference_id=NEW.id
    AND currency=NEW.currency AND country_code=NEW.country_code;
  IF j IS NULL THEN RAISE EXCEPTION 'Financial journal missing'; END IF;
  SELECT coalesce(sum(amount_minor) FILTER (WHERE side='DEBIT'),0) INTO total
    FROM ledger_postings WHERE journal_entry_id=j;
  IF total<>NEW.amount_minor THEN RAISE EXCEPTION 'Journal amount does not match intent'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER collection_success_commit AFTER INSERT OR UPDATE ON payment_intents
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_success_commit();
CREATE CONSTRAINT TRIGGER payout_success_commit AFTER INSERT OR UPDATE ON payout_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_success_commit();
