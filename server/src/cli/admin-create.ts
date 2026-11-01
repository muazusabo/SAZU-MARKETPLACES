/**
 * Promote an existing account to administrator and set its password.
 * Credentials are supplied through ADMIN_EMAIL and ADMIN_PASSWORD.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { Client } from 'pg';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set ADMIN_EMAIL to a valid email address.');
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Set ADMIN_PASSWORD to a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const passwordHash = await argon2.hash(password);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? true : undefined,
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    const user = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND status <> 'deleted' FOR UPDATE`,
      [email],
    );
    if (!user.rows[0]) throw new Error(`No account found for ${email}. Register this email first.`);

    await client.query(
      'UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [user.rows[0].id, passwordHash],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
      [user.rows[0].id],
    );
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [user.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(`Admin access and password configured for ${email}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Failed to configure administrator.');
  process.exit(1);
});
