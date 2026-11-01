-- Up Migration
-- Wishlist and the conversation/message foundation used by "Chat with Seller" and "I'm Interested".

-- One row per saved product replaces separate wishlists/wishlist_items tables: every user has exactly one wishlist,
-- so the composite key enforces "one entry per user and product" directly.
CREATE TABLE wishlist_items (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX wishlist_items_product_idx ON wishlist_items (product_id);

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id      uuid REFERENCES products (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CHECK (buyer_id <> seller_id)
);
-- One conversation per buyer, seller and product (NULL product counts as a value, not "unknown").
CREATE UNIQUE INDEX conversations_unique_idx ON conversations (buyer_id, seller_id, product_id) NULLS NOT DISTINCT;
CREATE INDEX conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON conversations (seller_id, last_message_at DESC);
CREATE INDEX conversations_product_idx ON conversations (product_id);
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-person state. last_read_at drives unread counts and read receipts (Phase 6).
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('buyer', 'seller')),
  last_read_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id);

CREATE TABLE messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id DESC);

INSERT INTO platform_settings (key, value, description) VALUES
  ('max_new_conversations_per_day', '30',  'New conversations a buyer can start per 24 hours (anti-spam)'),
  ('max_wishlist_items',            '200', 'Saved products per user');

-- Down Migration
DELETE FROM platform_settings WHERE key IN ('max_new_conversations_per_day', 'max_wishlist_items');
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS wishlist_items;
