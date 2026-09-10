ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE provider_transactions
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_idempotency_idx
  ON payment_intents(product_code, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_reference_idx
  ON journal_entries(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS provider_transactions_payment_idx
  ON provider_transactions(payment_intent_id, created_at DESC);

INSERT INTO provider_markets
  (country_code, provider_code, enabled, environment, target_environment, credential_ref)
VALUES
  ('UG','mtn',TRUE,'sandbox','sandbox','MTN_UG'),
  ('UG','airtel',TRUE,'sandbox',NULL,'AIRTEL_UG'),
  ('RW','mtn',FALSE,'sandbox','sandbox','MTN_RW'),
  ('RW','airtel',FALSE,'sandbox',NULL,'AIRTEL_RW'),
  ('ZM','mtn',FALSE,'sandbox','sandbox','MTN_ZM'),
  ('ZM','airtel',FALSE,'sandbox',NULL,'AIRTEL_ZM'),
  ('GH','mtn',FALSE,'sandbox','sandbox','MTN_GH'),
  ('CM','mtn',FALSE,'sandbox','sandbox','MTN_CM'),
  ('CI','mtn',FALSE,'sandbox','sandbox','MTN_CI'),
  ('BJ','mtn',FALSE,'sandbox','sandbox','MTN_BJ'),
  ('CG','mtn',FALSE,'sandbox','sandbox','MTN_CG'),
  ('CG','airtel',FALSE,'sandbox',NULL,'AIRTEL_CG'),
  ('SZ','mtn',FALSE,'sandbox','sandbox','MTN_SZ'),
  ('GN','mtn',FALSE,'sandbox','sandbox','MTN_GN'),
  ('KE','airtel',FALSE,'sandbox',NULL,'AIRTEL_KE'),
  ('TZ','airtel',FALSE,'sandbox',NULL,'AIRTEL_TZ'),
  ('MW','airtel',FALSE,'sandbox',NULL,'AIRTEL_MW'),
  ('CD','airtel',FALSE,'sandbox',NULL,'AIRTEL_CD'),
  ('GA','airtel',FALSE,'sandbox',NULL,'AIRTEL_GA'),
  ('TD','airtel',FALSE,'sandbox',NULL,'AIRTEL_TD'),
  ('NE','airtel',FALSE,'sandbox',NULL,'AIRTEL_NE'),
  ('MG','airtel',FALSE,'sandbox',NULL,'AIRTEL_MG'),
  ('SC','airtel',FALSE,'sandbox',NULL,'AIRTEL_SC')
ON CONFLICT (country_code, provider_code, environment) DO NOTHING;
