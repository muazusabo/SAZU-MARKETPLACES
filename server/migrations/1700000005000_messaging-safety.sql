-- Up Migration
-- Notifications, blocking, reports, and id-based read tracking for conversations.

ALTER TABLE conversation_participants ADD COLUMN last_read_message_id bigint;

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN (
               'new_message', 'seller_approved', 'seller_rejected', 'seller_suspended', 'seller_reinstated',
               'listing_approved', 'listing_rejected', 'listing_expiring', 'moderation_action', 'report_update')),
  title      text NOT NULL CHECK (char_length(title) <= 120),
  body       text CHECK (char_length(body) <= 300),
  -- Same-site relative path only, so a notification can never send someone to another website.
  link       text CHECK (link IS NULL OR link ~ '^/[^/\\]'),
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
-- At most one UNREAD "new message" notification per conversation: further messages update it instead of piling up.
CREATE UNIQUE INDEX notifications_unread_message_idx ON notifications (user_id, (data ->> 'conversationId'))
  WHERE type = 'new_message' AND read_at IS NULL;

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id);

-- target_id is polymorphic (product, seller profile, user or conversation id), so it has no foreign key;
-- the service validates the target and the reporter's right to report it.
CREATE TABLE reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type     text NOT NULL CHECK (target_type IN ('product', 'seller', 'user', 'conversation')),
  target_id       uuid NOT NULL,
  reason          text NOT NULL CHECK (reason IN ('prohibited_item', 'counterfeit', 'scam', 'misleading', 'harassment', 'spam', 'other')),
  details         text CHECK (char_length(details) <= 1000),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text CHECK (char_length(resolution_note) <= 1000),
  resolved_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- One open report per reporter and target (stops repeat-report spam).
CREATE UNIQUE INDEX reports_open_unique_idx ON reports (reporter_id, target_type, target_id) WHERE status IN ('open', 'reviewing');
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);

INSERT INTO platform_settings (key, value, description) VALUES
  ('max_messages_per_minute', '20', 'Messages one user can send per minute (anti-spam)'),
  ('max_reports_per_day',     '20', 'Reports one user can file per 24 hours');

-- Down Migration
DELETE FROM platform_settings WHERE key IN ('max_messages_per_minute', 'max_reports_per_day');
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS user_blocks;
DROP TABLE IF EXISTS notifications;
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS last_read_message_id;
