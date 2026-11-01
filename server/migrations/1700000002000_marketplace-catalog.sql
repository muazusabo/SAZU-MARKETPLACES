-- Up Migration
-- Catalog: categories (2 levels), configurable per-category attributes, seller profiles,
-- products with full-text search, images and privacy-friendly view tracking.

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES categories (id) ON DELETE RESTRICT,
  slug        citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX categories_parent_idx ON categories (parent_id);
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE category_attributes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label       text NOT NULL,
  input_type  text NOT NULL CHECK (input_type IN ('text', 'number', 'select', 'boolean', 'url')),
  options     jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (category_id, key),
  CHECK (input_type <> 'select' OR options IS NOT NULL)
);

CREATE TABLE seller_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  slug                  citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  shop_name             text NOT NULL CHECK (char_length(shop_name) BETWEEN 2 AND 60),
  description           text CHECK (char_length(description) <= 500),
  preferred_campus_area text CHECK (char_length(preferred_campus_area) <= 80),
  public_location       text CHECK (char_length(public_location) <= 80),
  avatar_path           text,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  -- Set only when an administrator has actually confirmed verification. Never defaulted.
  verified_at           timestamptz,
  approved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seller_profiles_status_idx ON seller_profiles (status);
CREATE TRIGGER seller_profiles_set_updated_at BEFORE UPDATE ON seller_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       uuid NOT NULL REFERENCES seller_profiles (id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  slug            citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description     text NOT NULL CHECK (char_length(description) <= 5000),
  -- Money is integer kobo (1 naira = 100 kobo). A listing price is informational, never a payment request.
  price_kobo      bigint NOT NULL CHECK (price_kobo >= 0 AND price_kobo <= 100000000000),
  product_type    text NOT NULL DEFAULT 'product' CHECK (product_type IN ('product', 'service')),
  condition       text CHECK (condition IN ('new', 'like_new', 'used_good', 'used_fair')),
  availability    text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'reserved', 'sold', 'unavailable')),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected', 'archived', 'removed')),
  campus_location text CHECK (char_length(campus_location) <= 80),
  collection_info text CHECK (char_length(collection_info) <= 300),
  rejection_reason text,
  published_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search_vector   tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED,
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX products_search_idx ON products USING gin (search_vector);
CREATE INDEX products_title_trgm_idx ON products USING gin (title gin_trgm_ops);
CREATE INDEX products_location_trgm_idx ON products USING gin (campus_location gin_trgm_ops);
CREATE INDEX products_pub_newest_idx ON products (published_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX products_pub_category_idx ON products (category_id, published_at DESC) WHERE status = 'published';
CREATE INDEX products_pub_price_idx ON products (price_kobo) WHERE status = 'published';
CREATE INDEX products_seller_idx ON products (seller_id, status);

CREATE TABLE product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text     text CHECK (char_length(alt_text) <= 200),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);

CREATE TABLE product_attribute_values (
  product_id   uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES category_attributes (id) ON DELETE CASCADE,
  value        text NOT NULL CHECK (char_length(value) <= 500),
  PRIMARY KEY (product_id, attribute_id)
);

-- viewer_hash is a salted, daily-rotating hash: enough to de-duplicate, not to identify anyone.
-- Retention: rows older than 90 days should be purged by a scheduled job (see docs/catalog.md).
CREATE TABLE product_views (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  viewer_hash text NOT NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_views_product_time_idx ON product_views (product_id, viewed_at);
CREATE INDEX product_views_dedupe_idx ON product_views (viewer_hash, product_id, viewed_at);

-- Reference data: the ten top-level categories from the product brief (administrators can edit later).
INSERT INTO categories (slug, name, icon, sort_order) VALUES
  ('electronics', 'Electronics', 'smartphone', 10),
  ('books-study-materials', 'Books and Study Materials', 'book-open', 20),
  ('food-drinks', 'Food and Drinks', 'utensils-crossed', 30),
  ('fashion-accessories', 'Fashion and Accessories', 'shirt', 40),
  ('beauty-personal-care', 'Beauty and Personal Care', 'sparkles', 50),
  ('hostel-room-essentials', 'Hostel and Room Essentials', 'bed-double', 60),
  ('furniture', 'Furniture', 'armchair', 70),
  ('student-services', 'Student Services', 'wrench', 80),
  ('sports-gaming', 'Sports and Gaming', 'gamepad-2', 90),
  ('other-approved-products', 'Other Approved Products', 'package', 100);

-- Category-specific fields (seller forms in Phase 4 are generated from these).
INSERT INTO category_attributes (category_id, key, label, input_type, options, is_required, sort_order)
SELECT c.id, a.key, a.label, a.input_type, a.options::jsonb, a.is_required, a.sort_order
FROM categories c JOIN (VALUES
  ('electronics', 'brand', 'Brand', 'text', NULL, true, 1),
  ('electronics', 'model', 'Model', 'text', NULL, false, 2),
  ('electronics', 'warranty', 'Warranty information', 'text', NULL, false, 3),
  ('books-study-materials', 'author', 'Author', 'text', NULL, false, 1),
  ('books-study-materials', 'course', 'Course or subject', 'text', NULL, false, 2),
  ('books-study-materials', 'edition', 'Edition', 'text', NULL, false, 3),
  ('books-study-materials', 'format', 'Format', 'select', '["Physical","Digital"]', true, 4),
  ('food-drinks', 'ingredients', 'Ingredients or contents', 'text', NULL, true, 1),
  ('food-drinks', 'portion', 'Portion size', 'text', NULL, false, 2),
  ('food-drinks', 'allergens', 'Allergen information', 'text', NULL, false, 3),
  ('food-drinks', 'availability_schedule', 'Availability schedule', 'text', NULL, false, 4),
  ('food-drinks', 'pickup_location', 'Preparation or pickup location', 'text', NULL, false, 5),
  ('food-drinks', 'prepared_on', 'Preparation or expiry information', 'text', NULL, false, 6),
  ('fashion-accessories', 'size', 'Size', 'text', NULL, false, 1),
  ('fashion-accessories', 'color', 'Colour', 'text', NULL, false, 2),
  ('fashion-accessories', 'brand', 'Brand', 'text', NULL, false, 3),
  ('student-services', 'pricing_basis', 'Pricing basis', 'select', '["Per hour","Per project","Per item","Per day"]', true, 1),
  ('student-services', 'turnaround', 'Estimated turnaround time', 'text', NULL, false, 2),
  ('student-services', 'portfolio_url', 'Portfolio link', 'url', NULL, false, 3)
) AS a(cat, key, label, input_type, options, is_required, sort_order) ON a.cat = c.slug::text;

-- Down Migration
DROP TABLE IF EXISTS product_views;
DROP TABLE IF EXISTS product_attribute_values;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS seller_profiles;
DROP TABLE IF EXISTS category_attributes;
DROP TABLE IF EXISTS categories;
