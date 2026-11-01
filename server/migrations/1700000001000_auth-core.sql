-- Up Migration
-- Identity, roles, profiles, sessions, and one-time email tokens.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL,
  password_hash      text NOT NULL,
  email_verified_at  timestamptz,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended', 'deactivated', 'deleted')),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until       timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Roles are only ever granted by server-side code or the grant-role CLI, never from request bodies.
CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'seller', 'moderator', 'admin')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE profiles (
  user_id                     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  full_name                   text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  display_name                text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  phone                       text CHECK (phone ~ '^\+234[789][01][0-9]{8}$'),
  campus_area                 text CHECK (char_length(campus_area) <= 80),
  avatar_path                 text,
  student_verification_status text NOT NULL DEFAULT 'unverified'
                              CHECK (student_verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  terms_accepted_at           timestamptz NOT NULL,
  terms_version               text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only a SHA-256 hash of each opaque refresh token is stored. family_id links a rotation chain
-- so reuse of an old token can revoke the whole chain.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);

CREATE TABLE email_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_purpose_idx ON email_tokens (user_id, purpose);

-- Down Migration
DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS users;
