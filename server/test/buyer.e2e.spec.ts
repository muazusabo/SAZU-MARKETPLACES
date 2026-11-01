import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(30_000); // setup hashes passwords (argon2) and can be slow on busy machines

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_VERIFY_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_WRITE_LIMIT = '100000';
process.env.NODE_ENV = 'test';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'sazu-buyer-'));

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { SellerAccountService } from '../src/sellers/seller-account.service';

const PASSWORD = 'correct-horse-battery';

describe('Buyer experience: wishlist and conversations (real PostgreSQL)', () => {
  let app: INestApplication;
  let pool: Pool;
  let sellers: SellerAccountService;
  const outbox: MailMessage[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const userIds: Record<string, string> = {};

  async function user(email: string, name = email.split('@')[0]!, verify = true): Promise<string> {
    await api().post('/api/v1/auth/register').send({ fullName: `${name} Person`, displayName: `User ${name}`, email, password: PASSWORD, phone: '08031234567', acceptTerms: true }).expect(202);
    if (verify) {
      const code = [...outbox].reverse().find((m) => m.to === email)!.text.match(/verification code:\s*\n\n(\d{8})/i)![1];
      await api().post('/api/v1/auth/verify-email').send({ email, code }).expect(204);
    }
    const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    userIds[email] = res.body.data.user.id;
    return res.body.data.accessToken;
  }
  let sellerToken: string; let sellerUserId: string; let sellerId: string;
  async function product(title = 'Samsung Galaxy A14', over: Record<string, string | number | null> = {}): Promise<{ id: string; slug: string }> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
    const r = await pool.query(
      `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, status, availability, published_at)
       VALUES ($1, (SELECT id FROM categories WHERE slug = 'electronics'), $2, $3, 'A nice item in good condition.', 12500000, $4, $5, now()) RETURNING id, slug`,
      [sellerId, slug, title, over.status ?? 'published', over.availability ?? 'available']);
    return r.rows[0];
  }
  const setSetting = (k: string, v: unknown) => pool.query('UPDATE platform_settings SET value = $2::jsonb WHERE key = $1', [k, JSON.stringify(v)]);

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: MailMessage) => void outbox.push(m) }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    sellers = app.get(SellerAccountService);
  });
  afterAll(async () => { await app.close(); await pool.end(); });
  beforeEach(async () => {
    outbox.length = 0;
    await pool.query('TRUNCATE users CASCADE');
    await pool.query('UPDATE categories SET is_active = true');
    await pool.query(`INSERT INTO platform_settings (key, value) VALUES ('max_new_conversations_per_day','30'),('max_wishlist_items','200'),('seller_approval_required','true'),
      ('max_messages_per_minute','1000'),('max_reports_per_day','20')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    sellerToken = await user('seller@example.com', 'seller');
    const apply = await api().post('/api/v1/sellers/apply').set(auth(sellerToken)).send({ shopName: 'Aisha Tech', categorySlugs: ['electronics'] }).expect(201);
    sellerId = apply.body.data.id; sellerUserId = userIds['seller@example.com']!;
    await sellers.review(sellerId, 'approve');
  });

  describe('wishlist', () => {
    it('requires sign-in', async () => {
      await api().get('/api/v1/wishlist').expect(401);
      await api().get('/api/v1/wishlist/ids').expect(401);
      await api().post('/api/v1/wishlist/3b241101-e2bb-4255-8caf-4136c566a962').expect(401);
    });

    describe('listing reviews', () => {
      it('requires a verified account, prevents self-review and accepts one review per user', async () => {
        const listing = await product();
        await api().post(`/api/v1/products/${listing.slug}/reviews`).send({ rating: 5, body: 'Great quality and exactly as described.' }).expect(401);

        const unverified = await user('unverified@example.com', 'unverified', false);
        await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(unverified))
          .send({ rating: 5, body: 'Great quality and exactly as described.' }).expect(403);

        await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(sellerToken))
          .send({ rating: 5, body: 'Great quality and exactly as described.' }).expect(403);

        const buyer = await user('reviewer@example.com', 'reviewer');
        const created = await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(buyer))
          .send({ rating: 4, body: 'Good condition and the seller was helpful.' }).expect(201);
        expect(created.body.data).toMatchObject({ rating: 4, author: 'User reviewer', body: 'Good condition and the seller was helpful.' });

        await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(buyer))
          .send({ rating: 4, body: 'A second review must be rejected.' }).expect(409);
        await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(buyer))
          .send({ rating: 6, body: 'Rating outside allowed range.' }).expect(400);

        const detail = (await api().get(`/api/v1/products/${listing.slug}`).expect(200)).body.data;
        expect(detail.reviews).toMatchObject({ count: 1, averageRating: 4 });
        expect(detail.reviews.items).toHaveLength(1);
      });

      it('shows listing IDs and review averages on product cards', async () => {
        const listing = await product();
        const buyer = await user('reviewer@example.com', 'reviewer');
        await api().post(`/api/v1/products/${listing.slug}/reviews`).set(auth(buyer))
          .send({ rating: 5, body: 'Excellent condition, would recommend.' }).expect(201);
        const results = (await api().get('/api/v1/products').expect(200)).body.data;
        expect(results.find((item: { id: string }) => item.id === listing.id)).toMatchObject({ reviewCount: 1, averageRating: 5 });
      });
    });

    it('saves and removes idempotently with exactly one entry per user and product', async () => {
      const b = await user('buyer@example.com'); const p = await product();
      await api().post(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204);
      await api().post(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204);
      expect((await pool.query('SELECT count(*)::int AS n FROM wishlist_items')).rows[0].n).toBe(1);
      expect((await api().get('/api/v1/wishlist/ids').set(auth(b))).body.data).toEqual([p.id]);
      await api().delete(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204);
      await api().delete(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204);
      expect((await api().get('/api/v1/wishlist/ids').set(auth(b))).body.data).toEqual([]);
    });

    it('only lets people save publicly visible listings', async () => {
      const b = await user('buyer@example.com');
      for (const status of ['draft', 'pending_review', 'rejected', 'archived', 'removed']) {
        const p = await product(`Item ${status}`, { status });
        await api().post(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(404);
      }
      await api().post('/api/v1/wishlist/3b241101-e2bb-4255-8caf-4136c566a962').set(auth(b)).expect(404);
      await api().post('/api/v1/wishlist/not-a-uuid').set(auth(b)).expect(400);
      expect((await pool.query('SELECT count(*)::int AS n FROM wishlist_items')).rows[0].n).toBe(0);
    });

    it('keeps wishlists private: nobody sees another person’s saved items', async () => {
      const a = await user('a@example.com'); const b = await user('b@example.com'); const p = await product();
      await api().post(`/api/v1/wishlist/${p.id}`).set(auth(a)).expect(204);
      expect((await api().get('/api/v1/wishlist').set(auth(b))).body.data).toEqual([]);
      expect((await api().get('/api/v1/wishlist/ids').set(auth(b))).body.data).toEqual([]);
      await api().delete(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204); // no effect on A's entry
      expect((await api().get('/api/v1/wishlist/ids').set(auth(a))).body.data).toEqual([p.id]);
    });

    it('shows when a saved listing is no longer available, with the reason, and drops the link when it is gone', async () => {
      const b = await user('buyer@example.com');
      const live = await product('Still live'); const soon = await product('Gets sold'); const gone = await product('Gets removed'); const hold = await product('On hold', { availability: 'reserved' });
      for (const p of [live, soon, gone, hold]) await api().post(`/api/v1/wishlist/${p.id}`).set(auth(b)).expect(204);
      await pool.query(`UPDATE products SET availability = 'sold' WHERE id = $1`, [soon.id]);
      await pool.query(`UPDATE products SET status = 'removed' WHERE id = $1`, [gone.id]);
      const r = (await api().get('/api/v1/wishlist').set(auth(b)).expect(200)).body;
      const by = Object.fromEntries(r.data.map((i: { title: string }) => [i.title, i]));
      expect(by['Still live']).toMatchObject({ state: 'available', href: `/product/${live.slug}` });
      expect(by['On hold']).toMatchObject({ state: 'reserved' });
      expect(by['Gets sold']).toMatchObject({ state: 'sold', href: `/product/${soon.slug}` });
      expect(by['Gets removed']).toMatchObject({ state: 'removed', href: null });
      expect(r.meta.total).toBe(4);
      await pool.query(`UPDATE seller_profiles SET status = 'suspended' WHERE id = $1`, [sellerId]);
      expect((await api().get('/api/v1/wishlist').set(auth(b))).body.data.every((i: { state: string }) => i.state === 'removed')).toBe(true);
    });

    it('enforces the per-user limit but still allows re-saving an existing item', async () => {
      await setSetting('max_wishlist_items', 2);
      const b = await user('buyer@example.com'); const [p1, p2, p3] = [await product('One'), await product('Two'), await product('Three')];
      await api().post(`/api/v1/wishlist/${p1.id}`).set(auth(b)).expect(204);
      await api().post(`/api/v1/wishlist/${p2.id}`).set(auth(b)).expect(204);
      expect((await api().post(`/api/v1/wishlist/${p3.id}`).set(auth(b)).expect(409)).body.message).toMatch(/up to 2/);
      await api().post(`/api/v1/wishlist/${p1.id}`).set(auth(b)).expect(204);
    });

    it('shows sellers only an aggregate save count, never who saved', async () => {
      const a = await user('a@example.com'); const b = await user('b@example.com'); const p = await product();
      await api().post(`/api/v1/wishlist/${p.id}`).set(auth(a)); await api().post(`/api/v1/wishlist/${p.id}`).set(auth(b));
      const res = await api().get('/api/v1/seller/products').set(auth(sellerToken)).expect(200);
      expect(res.body.data[0].saves).toBe(2);
      expect(JSON.stringify(res.body)).not.toMatch(/a@example|b@example|User a|User b/);
    });

    it('exposes product ids publicly so the heart button can work', async () => {
      const p = await product();
      expect((await api().get(`/api/v1/products/${p.slug}`)).body.data.id).toBe(p.id);
      expect((await api().get('/api/v1/products')).body.data[0].id).toBe(p.id);
    });
  });

  describe('starting a conversation (Chat with Seller / I’m Interested)', () => {
    const start = (t: string | null, productId: string, interested?: boolean) => {
      const r = api().post('/api/v1/conversations').send({ productId, interested });
      return t ? r.set(auth(t)) : r;
    };

    it('requires sign-in and a verified email', async () => {
      const p = await product();
      await start(null, p.id).expect(401);
      const unverified = await user('unverified@example.com', 'unverified', false);
      expect((await start(unverified, p.id).expect(403)).body.message).toMatch(/Verify your email/);
    });

    it('creates a private conversation tied to the listing and reopens the same one on repeat clicks', async () => {
      const b = await user('buyer@example.com'); const p = await product();
      const first = (await start(b, p.id).expect(200)).body.data;
      expect(first).toMatchObject({ created: true, productSlug: p.slug });
      const again = (await start(b, p.id).expect(200)).body.data;
      expect(again).toMatchObject({ id: first.id, created: false });
      const cnt = await pool.query('SELECT (SELECT count(*)::int FROM conversations) AS c, (SELECT count(*)::int FROM conversation_participants) AS p');
      expect(cnt.rows[0]).toEqual({ c: 1, p: 2 });
      const roles = await pool.query('SELECT role, user_id FROM conversation_participants ORDER BY role');
      expect(roles.rows).toEqual([{ role: 'buyer', user_id: userIds['buyer@example.com'] }, { role: 'seller', user_id: sellerUserId }]);
    });

    it('keeps one conversation per buyer, seller and listing', async () => {
      const a = await user('a@example.com'); const b = await user('b@example.com');
      const p1 = await product('First phone'); const p2 = await product('Second phone');
      const ids = new Set<string>();
      for (const [t, p] of [[a, p1], [b, p1], [a, p2]] as const) ids.add((await start(t, p.id).expect(200)).body.data.id);
      expect(ids.size).toBe(3);
    });

    it('survives simultaneous clicks without creating duplicates', async () => {
      const b = await user('buyer@example.com'); const p = await product();
      const results = await Promise.all(Array.from({ length: 6 }, () => start(b, p.id, true)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect((await pool.query('SELECT count(*)::int AS n FROM conversations')).rows[0].n).toBe(1);
      expect((await pool.query('SELECT count(*)::int AS n FROM messages')).rows[0].n).toBe(1);
    });

    it('“I’m interested” sends one friendly message, once', async () => {
      const b = await user('buyer@example.com'); const p = await product('Rare Textbook');
      const c = (await start(b, p.id, true).expect(200)).body.data;
      await start(b, p.id, true).expect(200);
      const msgs = (await api().get(`/api/v1/conversations/${c.id}/messages`).set(auth(b)).expect(200)).body.data;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ mine: true });
      expect(msgs[0].body).toContain('Rare Textbook');
      const asSeller = (await api().get(`/api/v1/conversations/${c.id}/messages`).set(auth(sellerToken)).expect(200)).body.data;
      expect(asSeller[0].mine).toBe(false);
    });

    it('plain “Chat with seller” sends nothing until the buyer writes', async () => {
      const b = await user('buyer@example.com'); const p = await product();
      const c = (await start(b, p.id).expect(200)).body.data;
      expect((await api().get(`/api/v1/conversations/${c.id}/messages`).set(auth(b))).body.data).toEqual([]);
    });

    it('stops sellers from messaging themselves', async () => {
      const p = await product();
      expect((await start(sellerToken, p.id).expect(400)).body.message).toMatch(/your own listing/);
      expect((await pool.query('SELECT count(*)::int AS n FROM conversations')).rows[0].n).toBe(0);
    });

    it('blocks new conversations on sold or unavailable listings, explaining why, but allows reserved', async () => {
      const b = await user('buyer@example.com');
      const sold = await product('Sold one', { availability: 'sold' }); const off = await product('Off one', { availability: 'unavailable' }); const held = await product('Held one', { availability: 'reserved' });
      expect((await start(b, sold.id).expect(409)).body.message).toMatch(/has been sold/);
      expect((await start(b, off.id).expect(409)).body.message).toMatch(/unavailable/);
      await start(b, held.id).expect(200);
    });

    it.each(['draft', 'pending_review', 'rejected', 'archived', 'removed'])('treats a %s listing as not found', async (status) => {
      const b = await user('buyer@example.com'); const p = await product('Hidden', { status });
      await start(b, p.id).expect(404);
    });

    it('treats listings of suspended sellers, unknown ids and bad input safely', async () => {
      const b = await user('buyer@example.com'); const p = await product();
      await sellers.review(sellerId, 'suspend', 'test');
      await start(b, p.id).expect(404);
      await start(b, '3b241101-e2bb-4255-8caf-4136c566a962').expect(404);
      await api().post('/api/v1/conversations').set(auth(b)).send({ productId: 'nope' }).expect(400);
      await api().post('/api/v1/conversations').set(auth(b)).send({ productId: p.id, buyerId: 'x', sellerId: 'y' }).expect(400); // participants are never client-supplied
    });

    it('limits how many new conversations a buyer can start per day', async () => {
      await setSetting('max_new_conversations_per_day', 2);
      const b = await user('buyer@example.com');
      const [p1, p2, p3] = [await product('One'), await product('Two'), await product('Three')];
      await start(b, p1.id).expect(200); await start(b, p2.id).expect(200);
      await start(b, p3.id).expect(429);
      await start(b, p1.id).expect(200); // reopening an existing conversation is not "new"
    });
  });

  describe('access control and messages', () => {
    let buyer: string; let convo: string;
    beforeEach(async () => {
      buyer = await user('buyer@example.com'); const p = await product();
      convo = (await api().post('/api/v1/conversations').set(auth(buyer)).send({ productId: p.id }).expect(200)).body.data.id;
    });
    const send = (t: string, id: string, body: unknown) => api().post(`/api/v1/conversations/${id}/messages`).set(auth(t)).send({ body });

    it('shows conversations only to their two participants (404 to everyone else, for every route)', async () => {
      const outsider = await user('outsider@example.com');
      await api().get(`/api/v1/conversations/${convo}`).set(auth(outsider)).expect(404);
      await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(outsider)).expect(404);
      await send(outsider, convo, 'let me in').expect(404);
      expect((await api().get('/api/v1/conversations').set(auth(outsider))).body.data).toEqual([]);
      await api().get(`/api/v1/conversations/${convo}`).expect(401);
      await api().get('/api/v1/conversations').expect(401);
      await api().get(`/api/v1/conversations/${convo}`).set(auth(buyer)).expect(200);
      await api().get(`/api/v1/conversations/${convo}`).set(auth(sellerToken)).expect(200);
      await api().get('/api/v1/conversations/not-a-uuid').set(auth(buyer)).expect(400);
      expect((await pool.query('SELECT count(*)::int AS n FROM messages')).rows[0].n).toBe(0);
    });

    it('persists messages in order and the sender can never be chosen by the client', async () => {
      await send(buyer, convo, 'Hello, is the phone still here?').expect(201);
      await send(sellerToken, convo, 'Yes it is!').expect(201);
      const forged = await api().post(`/api/v1/conversations/${convo}/messages`).set(auth(buyer)).send({ body: 'hi', senderId: sellerUserId });
      expect(forged.status).toBe(400);
      const asBuyer = (await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(buyer))).body.data;
      expect(asBuyer.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([['Hello, is the phone still here?', true], ['Yes it is!', false]]);
      const rows = await pool.query('SELECT sender_id FROM messages ORDER BY id');
      expect(rows.rows.map((r) => r.sender_id)).toEqual([userIds['buyer@example.com'], sellerUserId]);
      expect(JSON.stringify(asBuyer)).not.toMatch(/senderId|sender_id|@example/);
    });

    it('validates message bodies and keeps text as plain text', async () => {
      for (const body of ['', '   \n  ', 'x'.repeat(2001), 42, null, undefined]) await send(buyer, convo, body).expect(400);
      const m = await send(buyer, convo, '  <script>alert(1)</script>\u0000 hi\r\nthere  ').expect(201);
      expect(m.body.data.body).toBe('<script>alert(1)</script> hi\nthere'); // stored as text; the web app renders it escaped
    });

    it('pages through long histories with a stable cursor', async () => {
      for (let i = 1; i <= 45; i++) await send(i % 2 ? buyer : sellerToken, convo, `message ${i}`).expect(201);
      const p1 = (await api().get(`/api/v1/conversations/${convo}/messages?limit=30`).set(auth(buyer))).body;
      expect(p1.data).toHaveLength(30);
      expect(p1.data[0].body).toBe('message 16'); expect(p1.data[29].body).toBe('message 45');
      expect(p1.meta.hasMore).toBe(true);
      const p2 = (await api().get(`/api/v1/conversations/${convo}/messages?limit=30&before=${p1.meta.nextBefore}`).set(auth(buyer))).body;
      expect(p2.data).toHaveLength(15); expect(p2.data[0].body).toBe('message 1'); expect(p2.meta).toEqual({ hasMore: false, nextBefore: null });
      await api().get(`/api/v1/conversations/${convo}/messages?limit=500`).set(auth(buyer)).expect(400);
    });

    it('lists conversations with listing context, privacy-safe names, and live listing state', async () => {
      await send(buyer, convo, 'Is it available?').expect(201);
      const asBuyer = (await api().get('/api/v1/conversations').set(auth(buyer)).expect(200)).body.data[0];
      expect(asBuyer).toMatchObject({ id: convo, role: 'buyer', counterpart: { name: 'Aisha Tech' }, lastMessage: { body: 'Is it available?', mine: true } });
      expect(asBuyer.product).toMatchObject({ title: 'Samsung Galaxy A14', state: 'available' });
      const asSeller = (await api().get('/api/v1/conversations').set(auth(sellerToken)).expect(200)).body.data[0];
      expect(asSeller).toMatchObject({ role: 'seller', counterpart: { name: 'User buyer' }, lastMessage: { mine: false } });
      expect(JSON.stringify([asBuyer, asSeller])).not.toMatch(/@example\.com|08031234567|\+2348031234567|Buyer Person/i);

      await pool.query(`UPDATE products SET availability = 'sold'`);
      expect((await api().get(`/api/v1/conversations/${convo}`).set(auth(buyer))).body.data.product).toMatchObject({ state: 'sold', href: expect.stringMatching(/^\/product\//) });
      await pool.query(`UPDATE products SET status = 'removed'`);
      expect((await api().get(`/api/v1/conversations/${convo}`).set(auth(buyer))).body.data.product).toMatchObject({ state: 'removed', href: null });
    });

    it('lets an existing conversation continue after the item is sold (only NEW conversations are blocked)', async () => {
      await pool.query(`UPDATE products SET availability = 'sold'`);
      await send(buyer, convo, 'Sorry I missed it, can you tell me if you get another?').expect(201);
      await send(sellerToken, convo, 'Sure!').expect(201);
    });

    it('orders the inbox by latest activity', async () => {
      const p2 = await product('Second item');
      const c2 = (await api().post('/api/v1/conversations').set(auth(buyer)).send({ productId: p2.id }).expect(200)).body.data.id;
      await send(buyer, convo, 'older thread gets a message last').expect(201);
      const list = (await api().get('/api/v1/conversations').set(auth(buyer))).body.data.map((c: { id: string }) => c.id);
      expect(list).toEqual([convo, c2]);
    });

    it('revokes access when an account is suspended', async () => {
      await pool.query(`UPDATE users SET status = 'suspended' WHERE email = 'buyer@example.com'`);
      await api().get(`/api/v1/conversations/${convo}`).set(auth(buyer)).expect(401);
    });
  });
});
