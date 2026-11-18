-- Homepage hero image settings.
INSERT INTO platform_settings (key, value, description)
VALUES
  ('homepage_hero_image_path', '""', 'Public homepage hero image. Empty uses the built-in illustration.'),
  ('homepage_hero_image_position', '"center"', 'Crop position for the public homepage hero image')
ON CONFLICT (key) DO NOTHING;

-- Down Migration
DELETE FROM platform_settings WHERE key IN ('homepage_hero_image_path', 'homepage_hero_image_position');
