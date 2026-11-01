/**
 * Server-side role administration. There is deliberately no HTTP endpoint for the first admin.
 * Usage: npm run admin:grant -w apps/api -- someone@example.com admin
 *        npm run admin:grant -w apps/api -- someone@example.com admin --revoke
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { emitKeypressEvents } from 'node:readline';

const ROLES = ['user', 'seller', 'moderator', 'admin'];
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || !input.setRawMode) {
    throw new Error('Password input requires an interactive terminal.');
  }

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  process.stdout.write(prompt);

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      process.stdout.write('\n');
    };
    const onKeypress = (char: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Password entry cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(value);
      } else if (key.name === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (char && !key.ctrl) {
        value += char;
        process.stdout.write('*');
      }
    };
    input.on('keypress', onKeypress);
  });
}

async function getPassword(): Promise<string> {
  const password = await readHidden('New password: ');
  const confirmation = await readHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
  return password;
}

async function main() {
  const [email, role, ...flags] = process.argv.slice(2);
  const revoke = flags.includes('--revoke');
  const setPassword = flags.includes('--set-password');
  const unknownFlags = flags.filter((flag) => flag !== '--revoke' && flag !== '--set-password');
  if (!email || !ROLES.includes(role ?? '')) {
    console.error(`Usage: grant-role <email> <${ROLES.join('|')}> [--revoke] [--set-password]`);
    process.exit(2);
  }
  if (unknownFlags.length || (revoke && setPassword)) {
    throw new Error('Unknown or incompatible options. Use --set-password to set a password, or --revoke to remove a role.');
  }

  const passwordHash = setPassword ? await argon2.hash(await getPassword()) : undefined;
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? true : undefined });
  await client.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND status <> 'deleted'`, [email.toLowerCase()]);
    if (!u.rows[0]) throw new Error(`No account found for ${email}`);
    if (revoke) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [u.rows[0].id, role]);
      console.log(`Revoked ${role} from ${email}`);
    } else {
      await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.rows[0].id, role]);
      if (passwordHash) {
        await client.query(
          `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1`,
          [u.rows[0].id, passwordHash],
        );
        await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [u.rows[0].id]);
      }
      console.log(`Granted ${role} to ${email}${passwordHash ? ' and updated password' : ''}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
