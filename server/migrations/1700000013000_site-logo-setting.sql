INSERT INTO platform_settings (key, value, description)
VALUES ('site_logo_path', '""', 'Public site logo used in the marketplace header')
ON CONFLICT (key) DO NOTHING;

-- Down Migration
DELETE FROM platform_settings WHERE key = 'site_logo_path';
