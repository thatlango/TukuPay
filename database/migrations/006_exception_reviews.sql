CREATE TABLE IF NOT EXISTS payment_exception_reviews (
  kind TEXT NOT NULL CHECK (kind IN ('collection','payout')),
  transaction_id UUID NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN','INVESTIGATING','ESCALATED','REVIEWED')),
  assigned_to TEXT,
  note TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  PRIMARY KEY(kind,transaction_id)
);
