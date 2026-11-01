-- Up Migration
-- Seller applications, image variants, listing lifecycle, and runtime platform settings.

ALTER TABLE seller_profiles
  ADD COLUMN review_note         text CHECK (char_length(review_note) <= 500),
  ADD COLUMN submitted_at        timestamptz,
  ADD COLUMN contact_preferences text CHECK (char_length(contact_preferences) <= 200);

CREATE TABLE seller_profile_categories (
  seller_id   uuid NOT NULL REFERENCES seller_profiles (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (seller_id, category_id)
);

ALTER TABLE product_images
  ADD COLUMN thumb_path text,
  ADD COLUMN width      integer CHECK (width > 0),
  ADD COLUMN height     integer CHECK (height > 0),
  ADD COLUMN byte_size  integer CHECK (byte_size > 0);

ALTER TABLE products ADD COLUMN archived_at timestamptz;

-- Settings read at runtime (administrator UI arrives in Phase 7). No FK on updated_by on purpose.
CREATE TABLE platform_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
INSERT INTO platform_settings (key, value, description) VALUES
  ('seller_approval_required',     'true',     'Seller applications require administrator approval'),
  ('require_listing_image',        'true',     'A listing needs at least one photo before it can be submitted'),
  ('max_images_per_listing',       '6',        'Maximum photos per listing'),
  ('max_image_bytes',              '5242880',  'Maximum upload size per image (bytes)'),
  ('max_uploads_per_user_per_day', '60',       'Image uploads allowed per seller per 24 hours'),
  ('max_active_listings_per_seller','50',      'Pending plus published listings per seller'),
  ('listing_expiry_days',          '0',        'Days until a published listing expires (0 = never)');

-- Down Migration
DROP TABLE IF EXISTS platform_settings;
ALTER TABLE products DROP COLUMN IF EXISTS archived_at;
ALTER TABLE product_images DROP COLUMN IF EXISTS byte_size, DROP COLUMN IF EXISTS height, DROP COLUMN IF EXISTS width, DROP COLUMN IF EXISTS thumb_path;
DROP TABLE IF EXISTS seller_profile_categories;
ALTER TABLE seller_profiles DROP COLUMN IF EXISTS contact_preferences, DROP COLUMN IF EXISTS submitted_at, DROP COLUMN IF EXISTS review_note;
