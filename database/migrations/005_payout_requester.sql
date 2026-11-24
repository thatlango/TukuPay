-- Existing rows require independent review; do not invent historical identities.
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS requested_by TEXT;
