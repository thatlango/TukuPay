CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE countries (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL,
  dial_code TEXT NOT NULL,
  default_currency CHAR(3) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('mtn','airtel')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  target_environment TEXT,
  credential_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_code, provider_code, environment)
);

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL,
  external_id TEXT NOT NULL,
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  requested_provider TEXT CHECK (requested_provider IN ('mtn','airtel')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  phone_e164 TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (
    status IN ('CREATED','PENDING','SUCCESSFUL','FAILED','CANCELLED','EXPIRED')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_code, external_id)
);

CREATE TABLE provider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  provider_reference TEXT NOT NULL,
  provider_status TEXT,
  normalized_status TEXT NOT NULL CHECK (
    normalized_status IN ('CREATED','PENDING','SUCCESSFUL','FAILED','CANCELLED','EXPIRED')
  ),
  request_payload JSONB,
  response_payload JSONB,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_market_id, provider_reference)
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  event_key TEXT,
  payload JSONB NOT NULL,
  signature TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE UNIQUE INDEX webhook_events_dedupe_idx
  ON webhook_events(provider_market_id, event_key)
  WHERE event_key IS NOT NULL;

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  currency CHAR(3) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')
  ),
  product_code TEXT,
  country_code CHAR(2) REFERENCES countries(code),
  currency CHAR(3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
  ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  side TEXT NOT NULL CHECK (side IN ('DEBIT','CREDIT')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  checked_count INTEGER NOT NULL DEFAULT 0,
  corrected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  error TEXT
);

CREATE INDEX payment_intents_country_status_idx
  ON payment_intents(country_code, status, created_at DESC);

CREATE INDEX provider_transactions_status_idx
  ON provider_transactions(provider_market_id, normalized_status, updated_at);
