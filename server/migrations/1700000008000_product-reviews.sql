-- Up Migration
CREATE TABLE product_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX product_reviews_product_created_idx ON product_reviews (product_id, created_at DESC, id);

-- Down Migration
DROP TABLE IF EXISTS product_reviews;
