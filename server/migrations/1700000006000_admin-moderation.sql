-- Up Migration
-- Audit trail, moderation decisions, category rules, and editable site content/settings.

-- Append-only: audit rows can't be edited or deleted. The one allowed change is the database nulling actor_id
-- when an account row is hard-deleted (foreign key ON DELETE SET NULL).
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  action        text NOT NULL CHECK (char_length(action) <= 80),
  resource_type text,
  resource_id   text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Decisions about a listing, seller, user or report, with the reason shown to the affected person where appropriate.
CREATE TABLE moderation_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid REFERENCES users (id) ON DELETE SET NULL,
  target_type  text NOT NULL CHECK (target_type IN ('product', 'seller', 'user', 'report')),
  target_id    uuid NOT NULL,
  action       text NOT NULL CHECK (char_length(action) <= 40),
  reason       text CHECK (char_length(reason) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_target_idx ON moderation_actions (target_type, target_id, created_at DESC);
CREATE INDEX moderation_actions_moderator_idx ON moderation_actions (moderator_id, created_at DESC);

ALTER TABLE categories
  ADD COLUMN guidelines text CHECK (char_length(guidelines) <= 1000),
  ADD COLUMN max_images integer CHECK (max_images BETWEEN 1 AND 12);

-- Public site content and extra limits. Empty text means "not published yet": pages say so instead of inventing policy.
INSERT INTO platform_settings (key, value, description) VALUES
  ('allowed_image_types',          '["jpeg","png","webp"]', 'Image formats sellers may upload'),
  ('student_verification_required','false',                 'Whether student affiliation verification is required (informational until the verification flow exists)'),
  ('support_email',                '""',                    'Public support email address'),
  ('support_phone',                '""',                    'Public support phone number'),
  ('community_guidelines',         '""',                    'Community and safety guidelines shown on /safety'),
  ('terms_text',                   '""',                    'Terms of use shown on /terms'),
  ('privacy_text',                 '""',                    'Privacy policy shown on /privacy'),
  ('about_text',                   '""',                    'About text shown on /about');

-- Down Migration
DELETE FROM platform_settings WHERE key IN ('allowed_image_types','student_verification_required','support_email','support_phone','community_guidelines','terms_text','privacy_text','about_text');
ALTER TABLE categories DROP COLUMN IF EXISTS max_images, DROP COLUMN IF EXISTS guidelines;
DROP TABLE IF EXISTS moderation_actions;
DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_append_only();
DROP TABLE IF EXISTS audit_logs;
