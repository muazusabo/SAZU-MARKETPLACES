import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { join } from 'node:path';

jest.setTimeout(30_000); // setup hashes passwords (argon2) and can be slow on busy machines

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_VERIFY_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '100000';
process.env.NODE_ENV = 'test';

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService, MailMessage } from '../src/mail/mail.service';
import { DatabaseService } from '../src/database/database.service';

const PASSWORD = 'correct-horse-battery';
const validBody = (over: Record<string, unknown> = {}) => ({
  fullName: 'Amina Bello', displayName: 'Amina', email: 'amina@example.com',
  password: PASSWORD, phone: '0803 123 4567', campusArea: 'Hostel A', acceptTerms: true, ...over,
});

describe('Auth, profiles and permissions (real PostgreSQL)', () => {
  let app: INestApplication;
  let pool: Pool;
  let db: DatabaseService;
  const outbox: MailMessage[] = [];
  const tokenFrom = (m?: MailMessage) => m?.text.match(/token=([\w-]+)/)?.[1] ?? '';
  const codeFrom = (m?: MailMessage) => m?.text.match(/verification code:\s*\n\n(\d{8})/i)?.[1] ?? '';
  const lastMail = (to: string) => [...outbox].reverse().find((m) => m.to === to);

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: MailMessage) => void outbox.push(m) })
      .compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService);
  });
  afterAll(async () => { await app.close(); await pool.end(); });
  beforeEach(async () => { outbox.length = 0; await pool.query('TRUNCATE users CASCADE'); });

  const api = () => request(app.getHttpServer());
  async function registerAndVerify(over: Record<string, unknown> = {}) {
    const body = validBody(over);
    await api().post('/api/v1/auth/register').send(body).expect(202);
    await api().post('/api/v1/auth/verify-email').send({ email: body.email, code: codeFrom(lastMail(body.email as string)) }).expect(204);
    return body;
  }
  async function login(email = 'amina@example.com', password = PASSWORD) {
    const res = await api().post('/api/v1/auth/login').send({ email, password });
    return res;
  }

  describe('registration', () => {
    it('creates the account, stores a hash (never the password), normalises phone, grants only the user role', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      const { rows } = await pool.query(`SELECT u.password_hash, u.email_verified_at, p.phone, p.terms_version,
        (SELECT array_agg(role) FROM user_roles WHERE user_id = u.id) AS roles FROM users u JOIN profiles p ON p.user_id = u.id`);
      expect(rows).toHaveLength(1);
      expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
      expect(rows[0].password_hash).not.toContain(PASSWORD);
      expect(rows[0].phone).toBe('+2348031234567');
      expect(rows[0].roles).toEqual(['user']);
      expect(rows[0].email_verified_at).toBeNull();
      expect(lastMail('amina@example.com')?.subject).toMatch(/verification code/i);
      expect(codeFrom(lastMail('amina@example.com'))).toMatch(/^\d{8}$/);
    });

    it('does not reveal whether an email is already registered', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      const second = await api().post('/api/v1/auth/register').send(validBody({ displayName: 'Other' })).expect(202);
      expect(second.body.data.message).toMatch(/If this email can be used/);
      expect((await pool.query('SELECT 1 FROM users')).rowCount).toBe(1);
      expect(lastMail('amina@example.com')?.subject).toMatch(/already|Someone tried/i);
    });

    it.each([
      ['short password', { password: 'short' }],
      ['invalid email', { email: 'nope' }],
      ['bad phone', { phone: '12345' }],
      ['terms not accepted', { acceptTerms: false }],
      ['too-short name', { displayName: 'A' }],
    ])('rejects %s', async (_n, over) => {
      await api().post('/api/v1/auth/register').send(validBody(over)).expect(400);
    });

    it('rejects attempts to set roles or status in the body (mass assignment)', async () => {
      await api().post('/api/v1/auth/register').send(validBody({ roles: ['admin'], status: 'active' })).expect(400);
    });
  });

  describe('email verification', () => {
    it('verifies once; the code cannot be reused', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      const code = codeFrom(lastMail('amina@example.com'));
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code }).expect(204);
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code }).expect(400);
      const res = await login();
      expect(res.body.data.user.emailVerified).toBe(true);
    });
    it('rejects an expired code', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      await pool.query(`UPDATE email_tokens SET expires_at = now() - interval '1 minute'`);
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code: codeFrom(lastMail('amina@example.com')) }).expect(400);
    });
    it('resend invalidates the previous code', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      const first = codeFrom(lastMail('amina@example.com'));
      await api().post('/api/v1/auth/resend-verification').send({ email: 'amina@example.com' }).expect(202);
      const second = codeFrom(lastMail('amina@example.com'));
      expect(second).not.toBe(first);
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code: first }).expect(400);
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code: second }).expect(204);
    });
    it('locks the code after five incorrect guesses', async () => {
      await api().post('/api/v1/auth/register').send(validBody()).expect(202);
      const validCode = codeFrom(lastMail('amina@example.com'));
      for (let attempt = 0; attempt < 5; attempt++) {
        await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code: '00000000' === validCode ? '00000001' : '00000000' }).expect(400);
      }
      await api().post('/api/v1/auth/verify-email').send({ email: 'amina@example.com', code: validCode }).expect(400);
    });
    it('resend responds identically for unknown emails and sends nothing', async () => {
      await api().post('/api/v1/auth/resend-verification').send({ email: 'ghost@example.com' }).expect(202);
      expect(outbox).toHaveLength(0);
    });
  });

  describe('login and sessions', () => {
    it('signs in, returns an access token, and sets an httpOnly refresh cookie scoped to the auth path', async () => {
      await registerAndVerify();
      const res = await login();
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user.email).toBe('amina@example.com');
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|argon2/);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cookie).toMatch(/sazu_rt=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });
    it('gives the same error for a wrong password and an unknown email', async () => {
      await registerAndVerify();
      const a = await login('amina@example.com', 'wrong-password-123').then((r) => r);
      const b = await login('ghost@example.com', 'wrong-password-123').then((r) => r);
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });
    it('locks the account after repeated failures, even for the right password', async () => {
      await registerAndVerify();
      for (let i = 0; i < 5; i++) await login('amina@example.com', 'wrong-password-123').then((r) => r);
      const res = await login();
      expect(res.status).toBe(429);
    });
    it('rotates the refresh token on every use, leaving exactly one live token', async () => {
      await registerAndVerify();
      const c1 = ((await login()).headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      const r = await api().post('/api/v1/auth/refresh').set('Cookie', c1).expect(200);
      const c2 = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      expect(c2).not.toBe(c1);
      expect(r.body.data.accessToken).toBeTruthy();
      const rows = await pool.query('SELECT count(*)::int AS n, count(*) FILTER (WHERE revoked_at IS NULL)::int AS live FROM refresh_tokens');
      expect(rows.rows[0]).toEqual({ n: 2, live: 1 });
      await api().post('/api/v1/auth/refresh').set('Cookie', c2).expect(200);
    });
    it('treats replay of a rotated token (after the grace window) as theft and revokes all sessions in the chain', async () => {
      await registerAndVerify();
      const login1 = await login();
      const stolen = (login1.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', stolen).expect(200);
      const newer = (rotated.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      await pool.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE revoked_at IS NOT NULL`);
      await api().post('/api/v1/auth/refresh').set('Cookie', stolen).expect(401); // replay
      await api().post('/api/v1/auth/refresh').set('Cookie', newer).expect(401); // legit holder is cut off too
    });
    it('logout revokes the session', async () => {
      await registerAndVerify();
      const cookie = ((await login()).headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });
    it('refresh without a cookie means "no session" (200, no token), while an invalid cookie is 401', async () => {
      const none = await api().post('/api/v1/auth/refresh').expect(200);
      expect(none.body.data).toEqual({ accessToken: null, expiresIn: 0 });
      await api().post('/api/v1/auth/refresh').set('Cookie', 'sazu_rt=not-a-real-token').expect(401);
    });
  });

  describe('password reset', () => {
    it('is generic for unknown emails, resets with a single-use token, and signs out every device', async () => {
      await registerAndVerify();
      const cookie = ((await login()).headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      await api().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(202);
      expect(outbox.filter((m) => m.to === 'ghost@example.com')).toHaveLength(0);

      await api().post('/api/v1/auth/forgot-password').send({ email: 'amina@example.com' }).expect(202);
      const token = tokenFrom(lastMail('amina@example.com'));
      await api().post('/api/v1/auth/reset-password').send({ token, password: 'a-brand-new-password' }).expect(204);
      await api().post('/api/v1/auth/reset-password').send({ token, password: 'another-password-1' }).expect(400);

      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      expect((await login()).status).toBe(401);
      expect((await login('amina@example.com', 'a-brand-new-password')).status).toBe(200);
    });
    it('enforces the password policy on reset', async () => {
      await registerAndVerify();
      await api().post('/api/v1/auth/forgot-password').send({ email: 'amina@example.com' }).expect(202);
      await api().post('/api/v1/auth/reset-password').send({ token: tokenFrom(lastMail('amina@example.com')), password: 'short' }).expect(400);
    });
  });

  describe('protected routes and profile', () => {
    it('rejects missing, malformed and forged tokens', async () => {
      await api().get('/api/v1/users/me').expect(401);
      await api().get('/api/v1/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
      const forged = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
        Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000' })).toString('base64url') + '.';
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });
    it('returns and updates only the caller’s own profile', async () => {
      await registerAndVerify();
      await registerAndVerify({ email: 'musa@example.com', displayName: 'Musa', fullName: 'Musa Ali', phone: undefined });
      const a = (await login()).body.data.accessToken;
      const me = await api().get('/api/v1/users/me').set('Authorization', `Bearer ${a}`).expect(200);
      expect(me.body.data.email).toBe('amina@example.com');
      const upd = await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${a}`)
        .send({ displayName: 'Amina B', phone: '+2349012345678', campusArea: 'Library' }).expect(200);
      expect(upd.body.data.profile).toMatchObject({ displayName: 'Amina B', phone: '+2349012345678', campusArea: 'Library' });
      const cleared = await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${a}`).send({ phone: null }).expect(200);
      expect(cleared.body.data.profile.phone).toBeNull();
      const other = await pool.query(`SELECT display_name FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = 'musa@example.com'`);
      expect(other.rows[0].display_name).toBe('Musa');
    });
    it('cannot escalate privileges or tamper with protected fields via the profile endpoint', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      for (const body of [{ roles: ['admin'] }, { status: 'active' }, { emailVerified: true }, { studentVerificationStatus: 'verified' }, { email: 'x@y.com' }]) {
        await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${a}`).send(body).expect(400);
      }
      const r = await pool.query(`SELECT array_agg(role) AS roles FROM user_roles`);
      expect(r.rows[0].roles).toEqual(['user']);
    });
    it('rejects an invalid phone on update', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${a}`).send({ phone: '+1 202 555 0100' }).expect(400);
    });
    it('takes effect immediately when an account is suspended', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${a}`).expect(200);
      await pool.query(`UPDATE users SET status = 'suspended'`);
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${a}`).expect(401);
      expect((await login()).status).toBe(403);
    });
  });

  describe('deactivation and deletion', () => {
    it('requires the correct password', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      await api().post('/api/v1/users/me/deactivate').set('Authorization', `Bearer ${a}`).send({ password: 'wrong-password' }).expect(403);
      await api().delete('/api/v1/users/me').set('Authorization', `Bearer ${a}`).send({ password: 'wrong-password' }).expect(403);
    });
    it('deactivation signs the user out and signing in again reactivates', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      await api().post('/api/v1/users/me/deactivate').set('Authorization', `Bearer ${a}`).send({ password: PASSWORD }).expect(204);
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${a}`).expect(401);
      const again = await login();
      expect(again.status).toBe(200);
      expect(again.body.data.user.status).toBe('active');
    });
    it('deletion removes personal data and frees the email', async () => {
      await registerAndVerify();
      const a = (await login()).body.data.accessToken;
      await api().delete('/api/v1/users/me').set('Authorization', `Bearer ${a}`).send({ password: PASSWORD }).expect(204);
      const row = (await pool.query(`SELECT u.email, u.status, p.full_name, p.phone FROM users u JOIN profiles p ON p.user_id = u.id`)).rows[0];
      expect(row).toMatchObject({ status: 'deleted', full_name: 'Deleted user', phone: null });
      expect(row.email).toMatch(/^deleted\+/);
      expect((await login()).status).toBe(401);
      await api().post('/api/v1/auth/register').send(validBody()).expect(202); // email can be reused
      expect((await pool.query(`SELECT 1 FROM users WHERE status = 'active'`)).rowCount).toBe(1);
    });
  });

  it('health endpoints stay public while everything else is private by default', async () => {
    await api().get('/api/v1/health').expect(200);
    await api().get('/api/v1/health/ready').expect(200);
    expect(db).toBeDefined();
  });
});
