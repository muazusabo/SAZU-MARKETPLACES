-- Up Migration
CREATE TABLE listing_approval_migration_backup (
  product_id uuid PRIMARY KEY,
  published_at timestamptz,
  expires_at timestamptz,
  rejection_reason text
);

INSERT INTO listing_approval_migration_backup (product_id, published_at, expires_at, rejection_reason)
SELECT id, published_at, expires_at, rejection_reason
FROM products
WHERE status = 'pending_review';

UPDATE products p
SET status = 'published',
    rejection_reason = NULL,
    published_at = COALESCE(p.published_at, now()),
    expires_at = CASE
      WHEN COALESCE((SELECT value #>> '{}' FROM platform_settings WHERE key = 'listing_expiry_days')::integer, 0) > 0
      THEN now() + make_interval(days => (SELECT (value #>> '{}')::integer FROM platform_settings WHERE key = 'listing_expiry_days'))
      ELSE NULL
    END
WHERE p.status = 'pending_review';

DELETE FROM platform_settings WHERE key = 'listing_moderation_required';

-- Down Migration
UPDATE products p
SET status = 'pending_review',
    published_at = b.published_at,
    expires_at = b.expires_at,
    rejection_reason = b.rejection_reason
FROM listing_approval_migration_backup b
WHERE p.id = b.product_id;

DROP TABLE listing_approval_migration_backup;

INSERT INTO platform_settings (key, value, description)
VALUES ('listing_moderation_required', 'true', 'New and materially edited listings are reviewed before going public')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
