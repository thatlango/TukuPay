-- Binding is deliberately not populated by migration.
CREATE TABLE IF NOT EXISTS financial_environment_binding (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  environment TEXT NOT NULL CHECK(environment IN ('simulator','sandbox','production')),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION reject_environment_relabel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial environment binding is immutable';
END;
$$;
CREATE TRIGGER financial_environment_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON financial_environment_binding FOR EACH STATEMENT EXECUTE FUNCTION reject_environment_relabel();
