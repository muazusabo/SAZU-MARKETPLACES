-- Up Migration
-- Extensions needed by later phases: UUID generation, case-insensitive email, trigram search.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Shared trigger function to keep updated_at accurate (all timestamps are stored in UTC).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP FUNCTION IF EXISTS set_updated_at();
-- Extensions are intentionally left installed on rollback (other objects may depend on them).
