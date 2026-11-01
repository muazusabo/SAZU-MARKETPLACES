import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(30_000);

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = '1'; // lets the tests pretend to be different clients through X-Forwarded-For
process.env.THROTTLE_LIMIT = '6';
process.env.THROTTLE_AUTH_LIMIT = '4';
process.env.THROTTLE_VERIFY_LIMIT = '1000';
process.env.THROTTLE_REFRESH_LIMIT = '300';
process.env.THROTTLE_WRITE_LIMIT = '1000';
process.env.INTERNAL_API_KEY = 'internal-secret-internal-secret-1234';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'sazu-thr-'));

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';

const PASSWORD = 'correct-horse-battery';
let counter = 0;
const freshIp = () => `10.1.${Math.floor(++counter / 250)}.${counter % 250}`; // a different "client" per call

describe('Rate limiting (real HTTP pipeline, real database)', () => {
  let app: INestApplication; let pool: Pool;
  const outbox: MailMessage[] = [];
  const api = () => request(app.getHttpServer());
  const burst = async (n: number, send: () => request.Test) => { const out: number[] = []; for (let i = 0; i < n; i++) out.push((await send()).status); return out; };

  async function tokenFor(email: string): Promise<string> {
    const ip = freshIp();
    await api().post('/api/v1/auth/register').set('X-Forwarded-For', ip).send({ fullName: 'Throttle Test', displayName: 'Throttle', email, password: PASSWORD, acceptTerms: true }).expect(202);
    const code = [...outbox].reverse().find((m) => m.to === email)!.text.match(/verification code:\s*\n\n(\d{8})/i)![1];
    await api().post('/api/v1/auth/verify-email').set('X-Forwarded-For', ip).send({ email, code }).expect(204);
    return (await api().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: PASSWORD }).expect(200)).body.data.accessToken;
  }

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query('TRUNCATE users CASCADE');
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: MailMessage) => void outbox.push(m) }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); await pool.end(); });

  it('session refresh (called on every page load) is NOT held to the strict login limit', async () => {
    const ip = freshIp();
    const statuses = await burst(20, () => api().post('/api/v1/auth/refresh').set('X-Forwarded-For', ip));
    expect(statuses.every((s) => s === 200)).toBe(true); // no session: 200 every time, never 429
  });

  it('still limits password-guessing style traffic on login per IP', async () => {
    const ip = freshIp();
    const statuses = await burst(6, () => api().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email: 'nobody@example.com', password: 'wrong-password-1' }));
    expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
    const other = await api().post('/api/v1/auth/login').set('X-Forwarded-For', freshIp()).send({ email: 'nobody@example.com', password: 'wrong-password-1' });
    expect(other.status).toBe(401); // a different client is unaffected
  });

  it('limits anonymous browsing per IP', async () => {
    const ip = freshIp();
    const statuses = await burst(8, () => api().get('/api/v1/categories').set('X-Forwarded-For', ip));
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
  });

  it('counts signed-in people individually, so students sharing one campus IP do not block each other', async () => {
    const a = await tokenFor('a@example.com'); const b = await tokenFor('b@example.com');
    const shared = freshIp(); // the same address for both
    const get = (t: string) => api().get('/api/v1/users/me').set('Authorization', `Bearer ${t}`).set('X-Forwarded-For', shared);
    expect(await burst(8, () => get(a))).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
    expect((await get(b)).status).toBe(200); // B, same IP, is unaffected by A
    expect(await burst(5, () => get(b))).toEqual([200, 200, 200, 200, 200]);
    expect((await get(b)).status).toBe(429);
  });

  it('does not rate limit the web application’s own server-side requests (shared secret), and rejects a wrong secret', async () => {
    const ip = freshIp();
    const withKey = await burst(15, () => api().get('/api/v1/categories').set('X-Forwarded-For', ip).set('x-internal-key', process.env.INTERNAL_API_KEY!));
    expect(withKey.every((s) => s === 200)).toBe(true);
    const ipWrong = freshIp(); const ipShort = freshIp();
    const wrong = await burst(8, () => api().get('/api/v1/categories').set('X-Forwarded-For', ipWrong).set('x-internal-key', 'wrong-secret-wrong-secret-12345'));
    expect(wrong.filter((s) => s === 429).length).toBe(2); // a wrong key gets no special treatment
    const short = await burst(8, () => api().get('/api/v1/categories').set('X-Forwarded-For', ipShort).set('x-internal-key', 'x'));
    expect(short.filter((s) => s === 429).length).toBe(2);
  });

  it('returns a clear, safe 429 body', async () => {
    const ip = freshIp();
    await burst(6, () => api().get('/api/v1/categories').set('X-Forwarded-For', ip));
    const r = await api().get('/api/v1/categories').set('X-Forwarded-For', ip).expect(429);
    expect(r.body).toMatchObject({ statusCode: 429 });
    expect(JSON.stringify(r.body)).not.toMatch(/\.ts:\d+|node_modules/);
  });
});
