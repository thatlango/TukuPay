-- Read-only release audit. Run on an isolated database first.
-- Completion: zero rows from both SELECT statements.
BEGIN READ ONLY;

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

ROLLBACK;
