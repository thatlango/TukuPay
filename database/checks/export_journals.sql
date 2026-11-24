-- Read-only, normalized journal export. Run only on a dedicated authorized
-- read replica or isolated simulator. Journals do not encode environment.
-- psql -X -qAt -F $'\t' -v ON_ERROR_STOP=1 -f ... > restricted-file.tsv
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'journal_id'||chr(9)||'journal_currency'||chr(9)||'expected_minor'||chr(9)||'posting_id'||chr(9)||'account_id'||chr(9)||'account_currency'||chr(9)||'side'||chr(9)||'amount_minor';
SELECT j.id, j.currency,
       CASE WHEN j.reference_type='PAYMENT_COLLECTION' THEN coalesce(pi.amount_minor::text,'INVALID')
            WHEN j.reference_type='PAYOUT_DISBURSEMENT' THEN coalesce(pr.amount_minor::text,'INVALID') ELSE '-' END,
       coalesce(p.id::text,'MISSING'),coalesce(a.id::text,'MISSING'),
       coalesce(a.currency::text,'MISSING'),coalesce(p.side,'MISSING'),coalesce(p.amount_minor::text,'MISSING')
  FROM journal_entries j
  LEFT JOIN ledger_postings p ON p.journal_entry_id=j.id
  LEFT JOIN ledger_accounts a ON a.id=p.ledger_account_id
  LEFT JOIN payment_intents pi ON j.reference_type='PAYMENT_COLLECTION' AND pi.id=j.reference_id
  LEFT JOIN payout_requests pr ON j.reference_type='PAYOUT_DISBURSEMENT' AND pr.id=j.reference_id
 ORDER BY j.id,p.id
 LIMIT 100001;
ROLLBACK;
