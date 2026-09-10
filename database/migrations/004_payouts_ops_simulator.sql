CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL,
  external_id TEXT NOT NULL,
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('mtn','airtel')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  phone_e164 TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED' CHECK (
    status IN ('APPROVAL_REQUIRED','APPROVED','PENDING','SUCCESSFUL','FAILED','CANCELLED')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_code, external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_idempotency_idx
  ON payout_requests(product_code, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_payout_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES payout_requests(id),
  provider_market_id UUID NOT NULL REFERENCES provider_markets(id),
  provider_reference TEXT NOT NULL,
  provider_status TEXT,
  normalized_status TEXT NOT NULL CHECK (
    normalized_status IN ('PENDING','SUCCESSFUL','FAILED','CANCELLED')
  ),
  request_payload JSONB,
  response_payload JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_market_id, provider_reference)
);

CREATE INDEX IF NOT EXISTS provider_payout_transactions_pending_idx
  ON provider_payout_transactions(provider_market_id, normalized_status, updated_at);

CREATE TABLE IF NOT EXISTS payout_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES payout_requests(id),
  approved_by TEXT NOT NULL,
  reason TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulator_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('mtn','airtel')),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  provider_reference TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('collection','payout')),
  scenario TEXT NOT NULL,
  normalized_status TEXT NOT NULL,
  polls INTEGER NOT NULL DEFAULT 0,
  amount_major TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_code,country_code,provider_reference,kind)
);

CREATE TABLE IF NOT EXISTS provider_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('mtn','airtel')),
  account_type TEXT NOT NULL CHECK (account_type IN ('collection','disbursement')),
  available_major TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  simulated BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_balance_snapshots_latest_idx
  ON provider_balance_snapshots(country_code,provider_code,account_type,captured_at DESC);

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL REFERENCES countries(code),
  provider_code TEXT NOT NULL CHECK (provider_code IN ('mtn','airtel')),
  currency CHAR(3) NOT NULL,
  settlement_reference TEXT NOT NULL,
  gross_minor BIGINT NOT NULL CHECK (gross_minor > 0),
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_minor BIGINT NOT NULL CHECK (net_minor >= 0),
  bank_reference TEXT,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_code,provider_code,settlement_reference)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON audit_events(created_at DESC);
