-- Administrator-managed advertisements and aggregate campaign analytics.
CREATE TABLE advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  advertiser_name text NOT NULL CHECK (char_length(advertiser_name) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
  image_path text NOT NULL CHECK (char_length(image_path) <= 500),
  destination_url text NOT NULL CHECK (char_length(destination_url) <= 2048),
  placement text NOT NULL CHECK (placement IN ('home_banner', 'sponsored_product', 'browse_banner', 'category_banner')),
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused')),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advertisements_dates_valid CHECK (end_at > start_at),
  CONSTRAINT advertisements_category_placement CHECK (
    (placement = 'category_banner' AND category_id IS NOT NULL)
    OR (placement <> 'category_banner' AND category_id IS NULL)
  )
);
CREATE INDEX advertisements_placement_schedule_idx ON advertisements (placement, status, start_at, end_at);
CREATE INDEX advertisements_category_idx ON advertisements (category_id) WHERE category_id IS NOT NULL;

-- Keep an event for each click and a single impression per campaign and browser tab session.
CREATE TABLE advertisement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click')),
  visitor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX advertisement_impression_session_unique
  ON advertisement_events (advertisement_id, visitor_id)
  WHERE event_type = 'impression' AND visitor_id IS NOT NULL;
CREATE INDEX advertisement_events_campaign_date_idx ON advertisement_events (advertisement_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS advertisement_events;
DROP TABLE IF EXISTS advertisements;
