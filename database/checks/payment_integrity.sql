-- Read-only release audit. Run on an isolated database first.
-- Completion: zero rows from every SELECT statement.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH expected AS (
  SELECT id, amount_minor, 'PAYMENT_COLLECTION' AS kind FROM payment_intents WHERE status='SUCCESSFUL'
  UNION ALL
  SELECT id, amount_minor, 'PAYOUT_DISBURSEMENT' AS kind FROM payout_requests WHERE status='SUCCESSFUL'
)
SELECT e.kind,e.id, e.amount_minor,
       count(p.id) AS posting_count,
       coalesce(sum(p.amount_minor) FILTER (WHERE p.side='DEBIT'),0) AS debits,
       coalesce(sum(p.amount_minor) FILTER (WHERE p.side='CREDIT'),0) AS credits
FROM expected e
LEFT JOIN journal_entries j ON j.reference_id=e.id AND j.reference_type=e.kind
LEFT JOIN ledger_postings p ON p.journal_entry_id=j.id
GROUP BY e.kind,e.id,e.amount_minor
HAVING count(p.id) <> 2
    OR coalesce(sum(p.amount_minor) FILTER (WHERE p.side='DEBIT'),0) <> e.amount_minor
    OR coalesce(sum(p.amount_minor) FILTER (WHERE p.side='CREDIT'),0) <> e.amount_minor;

SELECT payout_request_id,count(*) AS attempts
FROM provider_payout_transactions
GROUP BY payout_request_id
HAVING count(*) > 1;

-- Verify current financial core records in the same read-only snapshot.
WITH intents AS (
 SELECT 'collection' AS kind,id,product_code,country_code,currency,amount_minor,status FROM payment_intents
 UNION ALL
 SELECT 'payout',id,product_code,country_code,currency,amount_minor,status FROM payout_requests
)
SELECT 'INTENT_EVENT_MISMATCH',i.kind,i.id
FROM intents i
WHERE NOT EXISTS (
 SELECT 1 FROM financial_events e WHERE e.kind=i.kind AND e.transaction_id=i.id
 AND e.status=i.status AND e.product_code=i.product_code AND e.currency=i.currency AND e.amount_minor=i.amount_minor
);

WITH attempts AS (
 SELECT 'collection' AS kind,payment_intent_id AS transaction_id,provider_market_id,provider_reference,normalized_status FROM provider_transactions
 UNION ALL
 SELECT 'payout',payout_request_id,provider_market_id,provider_reference,normalized_status FROM provider_payout_transactions
)
SELECT 'DISPATCH_RESERVATION_MISMATCH',a.kind,a.transaction_id
FROM attempts a
WHERE NOT EXISTS (
 SELECT 1 FROM financial_dispatch_records d WHERE d.kind=a.kind AND d.transaction_id=a.transaction_id
 AND d.provider_market_id=a.provider_market_id AND d.provider_reference=a.provider_reference
);

WITH intents AS (
 SELECT 'collection' AS kind,id,amount_minor,currency,status FROM payment_intents
 UNION ALL
 SELECT 'payout',id,amount_minor,currency,status FROM payout_requests
), attempts AS (
 SELECT 'collection' AS kind,payment_intent_id AS transaction_id,provider_market_id,provider_reference,normalized_status FROM provider_transactions
 UNION ALL
 SELECT 'payout',payout_request_id,provider_market_id,provider_reference,normalized_status FROM provider_payout_transactions
)
SELECT 'SUCCESS_EVIDENCE_MISMATCH',i.kind,i.id
FROM intents i WHERE i.status='SUCCESSFUL' AND NOT EXISTS (
 SELECT 1 FROM financial_success_evidence e JOIN attempts a
 ON a.kind=e.kind AND a.transaction_id=e.transaction_id AND a.provider_market_id=e.provider_market_id
 AND a.provider_reference=e.provider_reference AND a.normalized_status='SUCCESSFUL'
 WHERE e.kind=i.kind AND e.transaction_id=i.id AND e.amount_minor=i.amount_minor AND e.currency=i.currency
);

SELECT 'JOURNAL_SCOPE_OR_BALANCE_MISMATCH',j.id
FROM journal_entries j LEFT JOIN ledger_postings p ON p.journal_entry_id=j.id
LEFT JOIN ledger_accounts a ON a.id=p.ledger_account_id
GROUP BY j.id,j.currency,j.country_code
HAVING count(p.id)<2 OR coalesce(sum(p.amount_minor) FILTER(WHERE p.side='DEBIT'),0)<=0
 OR coalesce(sum(p.amount_minor) FILTER(WHERE p.side='DEBIT'),0)<>coalesce(sum(p.amount_minor) FILTER(WHERE p.side='CREDIT'),0)
 OR count(*) FILTER(WHERE p.id IS NOT NULL AND (a.currency IS DISTINCT FROM j.currency OR a.country_code IS DISTINCT FROM j.country_code))>0;

SELECT 'COLLECTION_DUPLICATE_ATTEMPT',payment_intent_id,count(*)
FROM provider_transactions GROUP BY payment_intent_id HAVING count(*)>1;

SELECT 'SETTLEMENT_REVIEW_CONFLICT',p.id
FROM settlement_proposals p JOIN settlement_proposal_reviews r ON r.proposal_id=p.id
WHERE lower(p.submitted_by)=lower(r.reviewer)
 OR (r.decision='APPROVED_FOR_RECONCILIATION' AND coalesce(btrim(r.evidence_reference),'')='');

SELECT 'PREMATURE_SETTLEMENT_JOURNAL',p.id
FROM settlement_proposals p JOIN journal_entries j ON j.reference_id=p.id AND j.reference_type='PROVIDER_SETTLEMENT';

ROLLBACK;
