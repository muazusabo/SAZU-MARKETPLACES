CREATE TABLE IF NOT EXISTS site_visitors (
  visitor_hash text PRIMARY KEY CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_visitors_last_seen_idx ON site_visitors (last_seen_at);

-- Down Migration
DROP TABLE IF EXISTS site_visitors;
