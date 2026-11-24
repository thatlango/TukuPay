-- Explicit provisioning for a NEW, EMPTY, already migrated database only.
-- psql -X -v ON_ERROR_STOP=1 -v environment=simulator -f database/checks/bind_empty_environment.sql
BEGIN;
LOCK TABLE financial_environment_binding, payment_intents, payout_requests,
  provider_transactions, provider_payout_transactions, ledger_accounts, journal_entries, ledger_postings,
  simulator_transactions, provider_balance_snapshots, settlements, webhook_events,
  reconciliation_runs, audit_events, payment_exception_reviews IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM payment_intents) OR EXISTS(SELECT 1 FROM payout_requests)
    OR EXISTS(SELECT 1 FROM provider_transactions) OR EXISTS(SELECT 1 FROM provider_payout_transactions)
    OR EXISTS(SELECT 1 FROM ledger_accounts) OR EXISTS(SELECT 1 FROM journal_entries) OR EXISTS(SELECT 1 FROM ledger_postings)
    OR EXISTS(SELECT 1 FROM simulator_transactions) OR EXISTS(SELECT 1 FROM provider_balance_snapshots)
    OR EXISTS(SELECT 1 FROM settlements) OR EXISTS(SELECT 1 FROM webhook_events)
    OR EXISTS(SELECT 1 FROM reconciliation_runs) OR EXISTS(SELECT 1 FROM audit_events)
    OR EXISTS(SELECT 1 FROM payment_exception_reviews) OR EXISTS(SELECT 1 FROM financial_environment_binding)
  THEN RAISE EXCEPTION 'Refusing to bind nonempty or already bound database'; END IF;
END $$;
INSERT INTO financial_environment_binding(environment) VALUES (:'environment');
COMMIT;
