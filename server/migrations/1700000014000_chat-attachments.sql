-- Up Migration
ALTER TABLE messages DROP CONSTRAINT messages_body_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_body_check CHECK (char_length(body) BETWEEN 0 AND 2000),
  ADD COLUMN attachment_path text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text,
  ADD COLUMN attachment_size integer;

ALTER TABLE messages
  ADD CONSTRAINT messages_attachment_content_check CHECK (
    (char_length(body) > 0 OR attachment_path IS NOT NULL)
    AND (
      (attachment_path IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL)
      OR
      (attachment_path IS NOT NULL AND attachment_name IS NOT NULL
        AND attachment_type IN ('image/webp', 'application/pdf')
        AND attachment_size BETWEEN 1 AND 10485760)
    )
  );

-- Down Migration
ALTER TABLE messages DROP CONSTRAINT messages_attachment_content_check;
DELETE FROM messages WHERE body = '';
ALTER TABLE messages
  DROP COLUMN attachment_path,
  DROP COLUMN attachment_name,
  DROP COLUMN attachment_type,
  DROP COLUMN attachment_size,
  DROP CONSTRAINT messages_body_check,
  ADD CONSTRAINT messages_body_check CHECK (char_length(body) BETWEEN 1 AND 2000);
