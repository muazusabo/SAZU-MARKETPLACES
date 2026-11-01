-- Up Migration
ALTER TABLE email_tokens
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0);

-- Down Migration
ALTER TABLE email_tokens DROP COLUMN attempts;
