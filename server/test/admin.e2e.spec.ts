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
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'sazu-admin-'));

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { SellerAccountService } from '../src/sellers/seller-account.service';
import { SETTING_DEFAULTS } from '../src/settings/settings.service';

const PASSWORD = 'correct-horse-battery';
const SEED_CATEGORIES = ['electronics', 'books-study-materials', 'food-drinks', 'fashion-accessories', 'beauty-personal-care', 'hostel-room-essentials', 'furniture', 'student-services', 'sports-gaming', 'other-approved-products'];
const png = () => sharp({ create: { width: 60, height: 40, channels: 3, background: '#2255aa' } }).png().toBuffer();

describe('Administration (real PostgreSQL)', () => {
  let app: INestApplication; let pool: Pool; let sellers: SellerAccountService;
  const outbox: MailMessage[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ids: Record<string, string> = {};
  let admin: string; let mod: string; let seller: string; let buyer: string; let plain: string; let sellerId: string;
  let sellerUserId: string; let buyerId: string;

  async function user(email: string, name = email.split('@')[0]!, extraRole?: 'admin' | 'moderator'): Promise<string> {
    await api().post('/api/v1/auth/register').send({ fullName: `${name} Person`, displayName: `User ${name}`, email, password: PASSWORD, acceptTerms: true }).expect(202);
    const code = [...outbox].reverse().find((m) => m.to === email)!.text.match(/verification code:\s*\n\n(\d{8})/i)![1];
    await api().post('/api/v1/auth/verify-email').send({ email, code }).expect(204);
    const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    ids[email] = res.body.data.user.id;
    if (extraRole) await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [ids[email], extraRole]);
    return res.body.data.accessToken;
  }
  async function product(status = 'published', title = 'Samsung Galaxy A14', availability = 'available'): Promise<{ id: string; slug: string }> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
    const r = await pool.query(
      `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, status, availability, published_at)
       VALUES ($1, (SELECT id FROM categories WHERE slug = 'electronics'), $2, $3, 'A nice item in good condition.', 12500000, $4, $5, CASE WHEN $4 IN ('published') THEN now() END) RETURNING id, slug`,
      [sellerId, slug, title, status, availability]);
    return r.rows[0];
  }
  const set = (key: string, value: unknown) => api().patch(`/api/v1/admin/settings/${key}`).set(auth(admin)).send({ value });
  const notifs = async (userId: string) => (await pool.query('SELECT type, title, body, link FROM notifications WHERE user_id = $1 ORDER BY created_at, id', [userId])).rows;
  const audit = async (action: string) => (await pool.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at', [action])).rows;

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    const mod_ = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: MailMessage) => void outbox.push(m) }).compile();
    app = mod_.createNestApplication();
    configureApp(app);
    await app.init();
    sellers = app.get(SellerAccountService);
  });
  afterAll(async () => { await app.close(); await pool.end(); });
  beforeEach(async () => {
    outbox.length = 0;
    await pool.query('TRUNCATE users CASCADE');
    await pool.query(`DELETE FROM categories WHERE parent_id IS NOT NULL`);
    await pool.query(`DELETE FROM categories WHERE slug <> ALL($1)`, [SEED_CATEGORIES]);
    await pool.query(`UPDATE categories SET is_active = true, guidelines = NULL, max_images = NULL`);
    await pool.query(`UPDATE categories SET name = 'Food and Drinks' WHERE slug = 'food-drinks'`); // a test renames it
    await pool.query(`DELETE FROM category_attributes WHERE key LIKE 'zz_%'`);
    for (const [k, v] of Object.entries(SETTING_DEFAULTS)) {
      await pool.query(`INSERT INTO platform_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, JSON.stringify(v)]);
    }
    admin = await user('admin@example.com', 'admin', 'admin'); mod = await user('mod@example.com', 'mod', 'moderator');
    plain = await user('plain@example.com', 'plain'); buyer = await user('buyer@example.com', 'buyer'); buyerId = ids['buyer@example.com']!;
    seller = await user('seller@example.com', 'seller'); sellerUserId = ids['seller@example.com']!;
    sellerId = (await api().post('/api/v1/sellers/apply').set(auth(seller)).send({ shopName: 'Aisha Tech', categorySlugs: ['electronics'] }).expect(201)).body.data.id;
    await sellers.review(sellerId, 'approve');
    await pool.query('DELETE FROM notifications');
  });

  describe('who can do what (enforced on the server)', () => {
    const moderationGets = ['overview', 'sellers/applications', 'products/pending', 'products', 'reports'];
    const adminGets = ['users', 'categories', 'settings', 'audit-logs'];

    it.each([...moderationGets, ...adminGets])('GET /admin/%s requires sign-in', async (p) => { await api().get(`/api/v1/admin/${p}`).expect(401); });
    it.each([...moderationGets, ...adminGets])('GET /admin/%s is forbidden to ordinary users, including sellers', async (p) => {
      for (const t of [plain, buyer, seller]) await api().get(`/api/v1/admin/${p}`).set(auth(t)).expect(403);
    });
    it.each(moderationGets)('GET /admin/%s works for moderators and administrators', async (p) => {
      await api().get(`/api/v1/admin/${p}`).set(auth(mod)).expect(200);
      await api().get(`/api/v1/admin/${p}`).set(auth(admin)).expect(200);
    });
    it.each(adminGets)('GET /admin/%s is administrators only (moderators get 403)', async (p) => {
      await api().get(`/api/v1/admin/${p}`).set(auth(mod)).expect(403);
      await api().get(`/api/v1/admin/${p}`).set(auth(admin)).expect(200);
    });
    it('keeps every write behind the right role', async () => {
      const u = ids['plain@example.com']!; const any = '3b241101-e2bb-4255-8caf-4136c566a962';
      const adminOnly: [string, string, object?][] = [
        ['patch', `/users/${u}/status`, { status: 'suspended', reason: 'x y z' }], ['post', `/users/${u}/roles`, { role: 'moderator' }], ['delete', `/users/${u}/roles/moderator`],
        ['patch', `/users/${u}/student-verification`, { status: 'verified' }], ['post', '/categories', { name: 'Gadgets' }], ['patch', `/categories/${any}`, { isActive: false }],
        ['patch', '/settings/max_reports_per_day', { value: 5 }], ['patch', `/sellers/${sellerId}/verified`, { verified: true }],
      ];
      for (const [m, path, body] of adminOnly) {
        for (const t of [null, plain, seller, mod]) {
          let r = (api() as unknown as Record<string, (p: string) => request.Test>)[m]!(`/api/v1/admin${path}`);
          if (t) r = r.set(auth(t));
          expect([m, path, (await r.send(body)).status]).toEqual([m, path, t ? 403 : 401]);
        }
      }
      const modOnly: [string, string, object][] = [
        ['patch', `/sellers/${sellerId}/review`, { decision: 'suspend', note: 'because' }], ['patch', `/products/${any}/review`, { decision: 'remove', reason: 'because' }], ['patch', `/reports/${any}`, { status: 'dismissed', note: 'because' }],
      ];
      for (const [m, path, body] of modOnly) {
        for (const t of [null, plain, seller]) {
          let r = (api() as unknown as Record<string, (p: string) => request.Test>)[m]!(`/api/v1/admin${path}`);
          if (t) r = r.set(auth(t));
          expect([m, path, (await r.send(body)).status]).toEqual([m, path, t ? 403 : 401]);
        }
      }
      expect((await pool.query('SELECT status FROM seller_profiles')).rows[0].status).toBe('approved'); // nothing leaked through
    });
    it('does not let anyone grant themselves privileges', async () => {
      const me = ids['plain@example.com']!;
      await api().patch('/api/v1/users/me').set(auth(plain)).send({ roles: ['admin'] }).expect(400);
      await api().post(`/api/v1/admin/users/${me}/roles`).set(auth(plain)).send({ role: 'moderator' }).expect(403);
      await api().post(`/api/v1/admin/users/${ids['mod@example.com']}/roles`).set(auth(mod)).send({ role: 'moderator' }).expect(403);
      await api().post(`/api/v1/admin/users/${me}/roles`).set(auth(admin)).send({ role: 'admin' }).expect(400); // admins only via the server CLI
      expect((await pool.query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('admin','moderator')`, [me])).rowCount).toBe(0);
    });
    it('takes effect immediately when a role is removed', async () => {
      await api().get('/api/v1/admin/overview').set(auth(mod)).expect(200);
      await api().delete(`/api/v1/admin/users/${ids['mod@example.com']}/roles/moderator`).set(auth(admin)).expect(200);
      await api().get('/api/v1/admin/overview').set(auth(mod)).expect(403);
    });
    it('validates ids', async () => { await api().get('/api/v1/admin/products/not-a-uuid').set(auth(admin)).expect(400); });
  });

  describe('overview', () => {
    it('reports live numbers, not hardcoded ones', async () => {
      const empty = (await api().get('/api/v1/admin/overview').set(auth(admin)).expect(200)).body.data.metrics;
      expect(empty).toMatchObject({ totalUsers: 5, approvedSellers: 1, pendingSellerApplications: 0, activeListings: 0, pendingListingReviews: 0, reportedProducts: 0, openReports: 0 });

      const live = await product(); await product('pending_review', 'Awaiting review'); await product('draft', 'Just a draft'); await product('published', 'Sold one', 'sold');
      const other = await user('shop2@example.com');
      await api().post('/api/v1/sellers/apply').set(auth(other)).send({ shopName: 'Second Shop', categorySlugs: ['electronics'] }).expect(201);
      await api().post('/api/v1/reports').set(auth(buyer)).send({ targetType: 'product', targetId: live.id, reason: 'scam' }).expect(201);
      await api().post('/api/v1/reports').set(auth(plain)).send({ targetType: 'product', targetId: live.id, reason: 'spam' }).expect(201);
      await api().post('/api/v1/reports').set(auth(plain)).send({ targetType: 'seller', targetId: sellerId, reason: 'misleading' }).expect(201);
      const m = (await api().get('/api/v1/admin/overview').set(auth(admin))).body.data.metrics;
      expect(m).toMatchObject({ totalUsers: 6, approvedSellers: 1, pendingSellerApplications: 1, activeListings: 1, pendingListingReviews: 1, reportedProducts: 1, openReports: 3 });
    });
    it('lists recent administrative activity, newest first, with the actor', async () => {
      const p = await product('pending_review');
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'approve' }).expect(200);
      await set('max_reports_per_day', 25).expect(200);
      const a = (await api().get('/api/v1/admin/overview').set(auth(mod))).body.data.recentActivity;
      expect(a.map((x: { action: string }) => x.action)).toEqual(['settings.update', 'product.approve']);
      expect(a[0].actor).toBe('User admin');
    });
  });

  describe('seller review', () => {
    let applicant: string; let appId: string;
    beforeEach(async () => {
      applicant = await user('applicant@example.com', 'applicant');
      appId = (await api().post('/api/v1/sellers/apply').set(auth(applicant)).send({ shopName: 'Fresh Shop', description: 'Snacks', categorySlugs: ['food-drinks'] }).expect(201)).body.data.id;
    });
    it('shows the oldest pending applications first with applicant details', async () => {
      const r = (await api().get('/api/v1/admin/sellers/applications').set(auth(mod)).expect(200)).body;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]).toMatchObject({ id: appId, shopName: 'Fresh Shop', status: 'pending', categories: ['Food and Drinks'], user: { email: 'applicant@example.com', emailVerified: true } });
      expect((await api().get('/api/v1/admin/sellers/applications?status=approved').set(auth(mod))).body.data.map((s: { shopName: string }) => s.shopName)).toEqual(['Aisha Tech']);
      await api().get('/api/v1/admin/sellers/applications?status=bogus').set(auth(mod)).expect(400);
    });
    it('approves with a record of who decided, notifies the seller, and opens public access', async () => {
      await api().get('/api/v1/sellers/fresh-shop').expect(404);
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'approve' }).expect(200);
      await api().get('/api/v1/sellers/fresh-shop').expect(200);
      expect((await pool.query(`SELECT action, moderator_id FROM moderation_actions WHERE target_id = $1`, [appId])).rows).toEqual([{ action: 'approve', moderator_id: ids['mod@example.com'] }]);
      expect((await audit('seller.approve'))).toHaveLength(1);
      expect((await notifs(ids['applicant@example.com']!)).map((n) => n.type)).toEqual(['seller_approved']);
    });
    it('requires a reason to reject or suspend, and refuses impossible transitions', async () => {
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'reject' }).expect(400);
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'suspend', note: 'because' }).expect(409); // not approved yet
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'reject', note: 'Please add a clearer description.' }).expect(200);
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'approve' }).expect(409);
      await api().patch(`/api/v1/admin/sellers/${appId}/review`).set(auth(mod)).send({ decision: 'maybe' }).expect(400);
      expect((await notifs(ids['applicant@example.com']!))[0]).toMatchObject({ type: 'seller_rejected', body: 'Please add a clearer description.' });
    });
    it('suspending a seller hides every listing at once', async () => {
      const p = await product();
      await api().get(`/api/v1/products/${p.slug}`).expect(200);
      await api().patch(`/api/v1/admin/sellers/${sellerId}/review`).set(auth(mod)).send({ decision: 'suspend', note: 'Counterfeit reports confirmed.' }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(404);
      await api().patch(`/api/v1/admin/sellers/${sellerId}/review`).set(auth(mod)).send({ decision: 'reinstate' }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(200);
    });
    it('shows the “Verified seller” badge only after an administrator confirms it', async () => {
      expect((await api().get('/api/v1/sellers/aisha-tech')).body.data.verified).toBe(false);
      await api().patch(`/api/v1/admin/sellers/${sellerId}/verified`).set(auth(admin)).send({ verified: true, note: 'Checked at the student affairs office.' }).expect(200);
      expect((await api().get('/api/v1/sellers/aisha-tech')).body.data.verified).toBe(true);
      await api().patch(`/api/v1/admin/sellers/${sellerId}/verified`).set(auth(admin)).send({ verified: false }).expect(200);
      expect((await api().get('/api/v1/sellers/aisha-tech')).body.data.verified).toBe(false);
      await api().patch(`/api/v1/admin/sellers/${appId}/verified`).set(auth(admin)).send({ verified: true }).expect(404); // pending sellers can't be verified
      expect((await audit('seller.verify')).length + (await audit('seller.unverify')).length).toBe(2);
    });
  });

  describe('listing moderation', () => {
    it('queues only listings awaiting review, oldest first, and supports search by status and text', async () => {
      const first = await product('pending_review', 'Older phone'); await new Promise((r) => setTimeout(r, 20));
      await product('pending_review', 'Newer phone'); await product('published', 'Live phone'); await product('draft', 'Draft phone');
      void first; // (updated_at is maintained by a trigger, so the queue order comes from insertion time)
      expect((await api().get('/api/v1/admin/products/pending').set(auth(mod))).body.data.map((p: { title: string }) => p.title)).toEqual(['Older phone', 'Newer phone']);
      expect((await api().get('/api/v1/admin/products?status=published').set(auth(mod))).body.data.map((p: { title: string }) => p.title)).toEqual(['Live phone']);
      expect((await api().get('/api/v1/admin/products?q=draft').set(auth(mod))).body.data.map((p: { title: string }) => p.title)).toEqual(['Draft phone']);
      expect((await api().get('/api/v1/admin/products?q=Aisha').set(auth(mod))).body.meta.total).toBe(4); // matches the shop name too
      expect((await api().get('/api/v1/admin/products?q=%25').set(auth(mod))).body.data).toEqual([]); // wildcards are literal
      await api().get('/api/v1/admin/products?status=bogus').set(auth(mod)).expect(400);
    });
    it('lets a moderator inspect a listing in any status with photos, seller and history', async () => {
      const p = await product('pending_review');
      await pool.query(`INSERT INTO product_images (product_id, storage_path, thumb_path, alt_text, sort_order) VALUES ($1, 'products/x/a.webp', 'products/x/a-thumb.webp', 'Front', 1)`, [p.id]);
      const d = (await api().get(`/api/v1/admin/products/${p.id}`).set(auth(mod)).expect(200)).body.data;
      expect(d).toMatchObject({ id: p.id, status: 'pending_review', sellerStatus: 'approved', openReports: 0, history: [] });
      expect(d.images[0]).toMatchObject({ alt: 'Front' }); expect(d.seller.shopName).toBe('Aisha Tech');
      await api().get('/api/v1/products/' + p.slug).expect(404); // inspection does not make it public
      await api().get('/api/v1/admin/products/3b241101-e2bb-4255-8caf-4136c566a962').set(auth(mod)).expect(404);
    });
    it('approves a pending listing: public, notified, expiry applied, and the decision is recorded', async () => {
      await set('listing_expiry_days', 30).expect(200);
      const p = await product('pending_review');
      await api().get(`/api/v1/products/${p.slug}`).expect(404);
      const r = (await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'approve' }).expect(200)).body.data;
      expect(r.status).toBe('published'); expect(r.history[0]).toMatchObject({ action: 'approve', moderator: 'User mod' });
      await api().get(`/api/v1/products/${p.slug}`).expect(200);
      expect((await pool.query(`SELECT expires_at > now() + interval '29 days' AS ok FROM products WHERE id = $1`, [p.id])).rows[0].ok).toBe(true);
      expect(await notifs(sellerUserId)).toEqual([{ type: 'listing_approved', title: 'Your listing “Samsung Galaxy A14” is live', body: 'Buyers can now find it.', link: `/product/${p.slug}` }]);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'approve' }).expect(409); // already live
    });
    it('rejects with a reason the seller can see, and the seller can fix and resubmit', async () => {
      const p = await product('pending_review');
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'reject' }).expect(400);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'reject', reason: 'ab' }).expect(400);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'reject', reason: 'Photos are too dark to see the item.' }).expect(200);
      const own = (await api().get(`/api/v1/seller/products/${p.id}`).set(auth(seller))).body.data;
      expect(own).toMatchObject({ status: 'rejected', rejectionReason: 'Photos are too dark to see the item.' });
      expect((await notifs(sellerUserId))[0]).toMatchObject({ type: 'listing_rejected', body: 'Photos are too dark to see the item.', link: `/dashboard/listings/${p.id}/edit` });
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'reject', reason: 'still bad' }).expect(409); // only pending listings
    });
    it('removes a live listing instantly (hidden, seller told why) and restores it', async () => {
      const p = await product();
      await api().get(`/api/v1/products/${p.slug}`).expect(200);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'remove' }).expect(400);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'remove', reason: 'Counterfeit item confirmed.' }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(404);
      expect((await notifs(sellerUserId))[0]).toMatchObject({ type: 'moderation_action', body: 'Counterfeit item confirmed.' });
      await api().patch(`/api/v1/products/${p.id}`).set(auth(seller)).send({ priceKobo: 500 }).expect(409); // the seller cannot touch a removed listing
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'remove', reason: 'again' }).expect(409);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'restore', reason: 'Appeal accepted.' }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(200); // it had been live, so it returns live
      const never = await product('pending_review', 'Never published');
      await api().patch(`/api/v1/admin/products/${never.id}/review`).set(auth(mod)).send({ decision: 'remove', reason: 'Prohibited item.' }).expect(200);
      await api().patch(`/api/v1/admin/products/${never.id}/review`).set(auth(mod)).send({ decision: 'restore' }).expect(200);
      expect((await pool.query('SELECT status FROM products WHERE id = $1', [never.id])).rows[0].status).toBe('pending_review'); // never public: back to the queue
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'restore' }).expect(409);
    });
    it('keeps a complete decision history for each listing', async () => {
      const p = await product('pending_review');
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(mod)).send({ decision: 'reject', reason: 'Needs a clearer title.' });
      await pool.query(`UPDATE products SET status = 'pending_review' WHERE id = $1`, [p.id]);
      await api().patch(`/api/v1/admin/products/${p.id}/review`).set(auth(admin)).send({ decision: 'approve' });
      const h = (await api().get(`/api/v1/admin/products/${p.id}`).set(auth(mod))).body.data.history;
      expect(h.map((x: { action: string; reason: string | null }) => [x.action, x.reason])).toEqual([['approve', null], ['reject', 'Needs a clearer title.']]);
    });
  });

  describe('reports', () => {
    let prod: { id: string; slug: string }; let convo: string;
    beforeEach(async () => {
      prod = await product();
      convo = (await api().post('/api/v1/conversations').set(auth(buyer)).send({ productId: prod.id, interested: true }).expect(200)).body.data.id;
      await api().post(`/api/v1/conversations/${convo}/messages`).set(auth(seller)).send({ body: 'Send the money to my cousin first.' }).expect(201);
      await pool.query('DELETE FROM notifications');
    });
    const file = (t: string, body: object) => api().post('/api/v1/reports').set(auth(t)).send(body).expect(201);

    it('lists open reports oldest first with the target, reporter and how many reports it already has', async () => {
      await file(buyer, { targetType: 'product', targetId: prod.id, reason: 'scam', details: 'Asked me to pay first.' });
      await file(plain, { targetType: 'product', targetId: prod.id, reason: 'spam' });
      await file(buyer, { targetType: 'conversation', targetId: convo, reason: 'harassment' });
      const r = (await api().get('/api/v1/admin/reports').set(auth(mod)).expect(200)).body;
      expect(r.meta.total).toBe(3);
      expect(r.data[0]).toMatchObject({ targetType: 'product', targetLabel: 'Samsung Galaxy A14', productSlug: prod.slug, reporter: 'User buyer', reportsOnTarget: 2, status: 'open' });
      expect((await api().get('/api/v1/admin/reports?targetType=conversation').set(auth(mod))).body.data).toHaveLength(1);
      expect((await api().get('/api/v1/admin/reports?status=resolved').set(auth(mod))).body.data).toEqual([]);
      await api().get('/api/v1/admin/reports?status=bogus').set(auth(mod)).expect(400);
    });
    it('shows the transcript only for conversation reports, and logs every time it is read', async () => {
      const prodReport = (await file(buyer, { targetType: 'product', targetId: prod.id, reason: 'scam' })).body.data.id;
      const convReport = (await file(buyer, { targetType: 'conversation', targetId: convo, reason: 'scam' })).body.data.id;
      const p = (await api().get(`/api/v1/admin/reports/${prodReport}`).set(auth(mod)).expect(200)).body.data;
      expect(p.conversation).toBeNull(); expect(await audit('report.view_conversation')).toHaveLength(0);
      const c = (await api().get(`/api/v1/admin/reports/${convReport}`).set(auth(mod)).expect(200)).body.data;
      expect(c.conversation.map((m: { role: string; body: string }) => [m.role, m.body.slice(0, 12)])).toEqual([['buyer', 'Hi! I’m inte'], ['seller', 'Send the mon']]);
      expect(JSON.stringify(c)).not.toMatch(/@example\.com/);
      await api().get(`/api/v1/admin/reports/${convReport}`).set(auth(admin)).expect(200);
      const logs = await audit('report.view_conversation');
      expect(logs).toHaveLength(2);
      expect(logs.map((l) => l.actor_id).sort()).toEqual([ids['admin@example.com'], ids['mod@example.com']].sort());
    });
    it('moves a report through review to a closed decision that needs a note, and thanks the reporter without details', async () => {
      const id = (await file(buyer, { targetType: 'product', targetId: prod.id, reason: 'counterfeit' })).body.data.id;
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'reviewing' }).expect(200);
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'reviewing' }).expect(409);
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'resolved' }).expect(400);
      const done = (await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'resolved', note: 'Listing removed; seller warned.' }).expect(200)).body.data;
      expect(done).toMatchObject({ status: 'resolved', resolutionNote: 'Listing removed; seller warned.' });
      expect((await pool.query('SELECT resolved_by FROM reports WHERE id = $1', [id])).rows[0].resolved_by).toBe(ids['mod@example.com']);
      expect((await notifs(buyerId))[0]).toMatchObject({ type: 'report_update', title: 'We reviewed your report' });
      expect(JSON.stringify(await notifs(buyerId))).not.toMatch(/removed|warned/); // the reporter is not told what happened to others
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'dismissed', note: 'changed my mind' }).expect(409);
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'open', note: 'x' }).expect(400);
    });
    it('dismisses reports with a different message and lets the same person report again afterwards', async () => {
      const id = (await file(plain, { targetType: 'seller', targetId: sellerId, reason: 'misleading' })).body.data.id;
      await api().patch(`/api/v1/admin/reports/${id}`).set(auth(mod)).send({ status: 'dismissed', note: 'No breach found.' }).expect(200);
      expect((await notifs(ids['plain@example.com']!))[0].body).toMatch(/did not find a breach/);
      await file(plain, { targetType: 'seller', targetId: sellerId, reason: 'scam' });
      expect((await api().get('/api/v1/admin/reports?status=dismissed').set(auth(mod))).body.data).toHaveLength(1);
    });
  });

  describe('user management', () => {
    const uid = (e: string) => ids[`${e}@example.com`]!;
    it('searches users by email or name, filters by status and role, and treats wildcards literally', async () => {
      expect((await api().get('/api/v1/admin/users?q=buyer').set(auth(admin))).body.data.map((u: { email: string }) => u.email)).toEqual(['buyer@example.com']);
      expect((await api().get('/api/v1/admin/users?role=moderator').set(auth(admin))).body.data.map((u: { email: string }) => u.email)).toEqual(['mod@example.com']);
      expect((await api().get('/api/v1/admin/users?q=%25').set(auth(admin))).body.data).toEqual([]);
      expect((await api().get('/api/v1/admin/users').set(auth(admin))).body.meta.total).toBe(5);
      await api().get('/api/v1/admin/users?status=bogus').set(auth(admin)).expect(400);
      await api().get('/api/v1/admin/users?pageSize=500').set(auth(admin)).expect(400);
    });
    it('shows a user’s record without ever exposing password hashes or tokens', async () => {
      const d = (await api().get(`/api/v1/admin/users/${uid('seller')}`).set(auth(admin)).expect(200)).body.data;
      expect(d).toMatchObject({ email: 'seller@example.com', status: 'active', roles: expect.arrayContaining(['user', 'seller']), seller: { shopName: 'Aisha Tech', status: 'approved' } });
      expect(JSON.stringify(d)).not.toMatch(/password|argon2|token_hash|refresh/i);
      await api().get('/api/v1/admin/users/3b241101-e2bb-4255-8caf-4136c566a962').set(auth(admin)).expect(404);
    });
    it('suspends with a reason, signing the person out of every session immediately, and reactivates', async () => {
      const cookie = ((await api().post('/api/v1/auth/login').send({ email: 'buyer@example.com', password: PASSWORD })).headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      await api().patch(`/api/v1/admin/users/${buyerId}/status`).set(auth(admin)).send({ status: 'suspended' }).expect(400);
      await api().patch(`/api/v1/admin/users/${buyerId}/status`).set(auth(admin)).send({ status: 'suspended', reason: 'Repeated harassment reports.' }).expect(200);
      await api().get('/api/v1/users/me').set(auth(buyer)).expect(401);
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      expect((await api().post('/api/v1/auth/login').send({ email: 'buyer@example.com', password: PASSWORD })).status).toBe(403);
      await api().patch(`/api/v1/admin/users/${buyerId}/status`).set(auth(admin)).send({ status: 'suspended', reason: 'again please' }).expect(409);
      const back = await api().patch(`/api/v1/admin/users/${buyerId}/status`).set(auth(admin)).send({ status: 'active' }).expect(200);
      expect(back.body.data.history.map((h: { action: string }) => h.action)).toEqual(['reactivate', 'suspend']);
      expect((await api().post('/api/v1/auth/login').send({ email: 'buyer@example.com', password: PASSWORD })).status).toBe(200);
      expect((await notifs(buyerId)).map((n) => n.type)).toEqual(['moderation_action']);
      await api().patch(`/api/v1/admin/users/${buyerId}/status`).set(auth(admin)).send({ status: 'active' }).expect(409); // not suspended
    });
    it('protects administrators and the acting admin from being suspended', async () => {
      await api().patch(`/api/v1/admin/users/${uid('admin')}/status`).set(auth(admin)).send({ status: 'suspended', reason: 'oops oops' }).expect(403);
      await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [uid('plain')]);
      await api().patch(`/api/v1/admin/users/${uid('plain')}/status`).set(auth(admin)).send({ status: 'suspended', reason: 'other admin' }).expect(403);
      expect((await pool.query(`SELECT status FROM users WHERE id IN ($1, $2)`, [uid('admin'), uid('plain')])).rows.every((r) => r.status === 'active')).toBe(true);
    });
    it('grants and revokes only the moderator role, with an audit trail', async () => {
      const d = (await api().post(`/api/v1/admin/users/${uid('plain')}/roles`).set(auth(admin)).send({ role: 'moderator' }).expect(200)).body.data;
      expect(d.roles).toContain('moderator');
      await api().get('/api/v1/admin/overview').set(auth(plain)).expect(200);
      await api().post(`/api/v1/admin/users/${uid('plain')}/roles`).set(auth(admin)).send({ role: 'superuser' }).expect(400);
      expect((await pool.query(`SELECT granted_by FROM user_roles WHERE user_id = $1 AND role = 'moderator'`, [uid('plain')])).rows[0].granted_by).toBe(uid('admin'));
      await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [uid('buyer')]);
      await api().post(`/api/v1/admin/users/${uid('buyer')}/roles`).set(auth(admin)).send({ role: 'moderator' }).expect(409);
      expect((await audit('user.grant_moderator')).length).toBe(1);
    });
    it('records student-verification decisions made by an administrator', async () => {
      await api().patch(`/api/v1/admin/users/${uid('buyer')}/student-verification`).set(auth(admin)).send({ status: 'verified', note: 'Seen at student affairs' }).expect(200);
      expect((await api().get('/api/v1/users/me').set(auth(buyer))).body.data.profile.studentVerificationStatus).toBe('verified');
      await api().patch(`/api/v1/admin/users/${uid('buyer')}/student-verification`).set(auth(admin)).send({ status: 'approved' }).expect(400);
      expect((await audit('user.student_verification'))[0].metadata).toMatchObject({ status: 'verified' });
    });
  });

  describe('categories', () => {
    it('creates categories and subcategories, generates unique slugs, and supports only two levels', async () => {
      const top = (await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Gadgets & Tech', guidelines: 'No stolen devices.' }).expect(201)).body.data;
      expect(top).toMatchObject({ slug: 'gadgets-tech', parentSlug: null, isActive: true, guidelines: 'No stolen devices.' });
      const sub = (await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Phones', parentSlug: 'electronics', sortOrder: 5 }).expect(201)).body.data;
      expect(sub).toMatchObject({ slug: 'phones', parentSlug: 'electronics' });
      const dup = (await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Phones', parentSlug: 'electronics' }).expect(201)).body.data;
      expect(dup.slug).toMatch(/^phones-[0-9a-f]{6}$/);
      await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Taken', slug: 'phones' }).expect(409);
      await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Too deep', parentSlug: 'phones' }).expect(400);
      await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Orphan', parentSlug: 'nope' }).expect(400);
      await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'X' }).expect(400);
      await api().post('/api/v1/admin/categories').set(auth(admin)).send({ name: 'Bad slug', slug: 'Bad Slug!' }).expect(400);
      const tree = (await api().get('/api/v1/categories')).body.data.find((c: { slug: string }) => c.slug === 'electronics');
      expect(tree.children.map((c: { slug: string }) => c.slug)).toContain('phones');
      expect((await pool.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'category.create'`)).rows[0].n).toBe(3);
    });
    it('disabling a category hides it and its listings from the public; enabling restores them', async () => {
      const p = await product();
      const cat = (await api().get('/api/v1/admin/categories').set(auth(admin))).body.data.find((c: { slug: string }) => c.slug === 'electronics');
      expect(cat.productCount).toBe(1);
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ isActive: false }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(404);
      expect((await api().get('/api/v1/categories')).body.data.map((c: { slug: string }) => c.slug)).not.toContain('electronics');
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ isActive: true }).expect(200);
      await api().get(`/api/v1/products/${p.slug}`).expect(200);
      expect((await audit('category.disable')).length + (await audit('category.enable')).length).toBe(2);
    });
    it('edits names, order and guidelines, and shows guidelines to sellers via the public category', async () => {
      const cat = (await api().get('/api/v1/admin/categories').set(auth(admin))).body.data.find((c: { slug: string }) => c.slug === 'food-drinks');
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ guidelines: 'List ingredients and allergens honestly.', maxImages: 3, name: 'Food & Drinks' }).expect(200);
      const pub = (await api().get('/api/v1/categories/food-drinks')).body.data;
      expect(pub).toMatchObject({ name: 'Food & Drinks', guidelines: 'List ingredients and allergens honestly.', maxImages: 3 });
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ guidelines: null, maxImages: null }).expect(200);
      expect((await api().get('/api/v1/categories/food-drinks')).body.data).toMatchObject({ guidelines: null, maxImages: null });
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ maxImages: 50 }).expect(400);
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ slug: 'new-slug' }).expect(400); // slugs are stable
    });
    it('enforces a category’s own photo limit on seller uploads', async () => {
      const cat = (await api().get('/api/v1/admin/categories').set(auth(admin))).body.data.find((c: { slug: string }) => c.slug === 'electronics');
      await api().patch(`/api/v1/admin/categories/${cat.id}`).set(auth(admin)).send({ maxImages: 1 }).expect(200);
      const id = (await api().post('/api/v1/products').set(auth(seller)).send({ title: 'Limited photos phone', description: 'Has a strict photo limit.', categorySlug: 'electronics', priceKobo: 500000, attributes: { brand: 'X' } }).expect(201)).body.data.id;
      await api().post(`/api/v1/products/${id}/images`).set(auth(seller)).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
      expect((await api().post(`/api/v1/products/${id}/images`).set(auth(seller)).attach('file', await png(), { filename: 'b.png', contentType: 'image/png' }).expect(409)).body.message).toMatch(/at most 1 photo/);
    });
    it('manages category-specific fields and refuses to delete fields sellers have already filled in', async () => {
      const cat = (await api().get('/api/v1/admin/categories').set(auth(admin))).body.data.find((c: { slug: string }) => c.slug === 'electronics');
      await api().post(`/api/v1/admin/categories/${cat.id}/attributes`).set(auth(admin)).send({ key: 'zz_color', label: 'Colour', inputType: 'select', options: ['Black'] }).expect(400); // needs two options
      await api().post(`/api/v1/admin/categories/${cat.id}/attributes`).set(auth(admin)).send({ key: 'ZZ Bad', label: 'Bad key', inputType: 'text' }).expect(400);
      await api().post(`/api/v1/admin/categories/${cat.id}/attributes`).set(auth(admin)).send({ key: 'zz_note', label: 'Note', inputType: 'text', options: ['a', 'b'] }).expect(400);
      const added = (await api().post(`/api/v1/admin/categories/${cat.id}/attributes`).set(auth(admin)).send({ key: 'zz_color', label: 'Colour', inputType: 'select', options: ['Black', 'Silver'], required: true }).expect(201)).body.data;
      const attr = added.attributes.find((a: { key: string }) => a.key === 'zz_color');
      expect(attr).toMatchObject({ options: ['Black', 'Silver'], required: true, inUse: false });
      await api().post(`/api/v1/admin/categories/${cat.id}/attributes`).set(auth(admin)).send({ key: 'zz_color', label: 'Again', inputType: 'text' }).expect(409);
      expect((await api().get('/api/v1/categories/electronics')).body.data.attributes.map((a: { key: string }) => a.key)).toContain('zz_color'); // sellers see it
      const bad = await api().post('/api/v1/products').set(auth(seller)).send({ title: 'Colour test phone', description: 'Testing the new field.', categorySlug: 'electronics', priceKobo: 500000, attributes: { brand: 'X', zz_color: 'Purple' } });
      expect(bad.status).toBe(400);
      const prodId = (await api().post('/api/v1/products').set(auth(seller)).send({ title: 'Colour test phone', description: 'Testing the new field.', categorySlug: 'electronics', priceKobo: 500000, attributes: { brand: 'X', zz_color: 'Black' } }).expect(201)).body.data.id;
      expect(prodId).toBeTruthy();
      await api().patch(`/api/v1/admin/categories/attributes/${attr.id}`).set(auth(admin)).send({ label: 'Colour (finish)', required: false }).expect(200);
      expect((await api().delete(`/api/v1/admin/categories/attributes/${attr.id}`).set(auth(admin)).expect(409)).body.message).toMatch(/Make it optional/);
      await pool.query('DELETE FROM products WHERE id = $1', [prodId]);
      await api().delete(`/api/v1/admin/categories/attributes/${attr.id}`).set(auth(admin)).expect(200);
      await api().delete(`/api/v1/admin/categories/attributes/${attr.id}`).set(auth(admin)).expect(404);
    });
  });

  describe('platform settings', () => {
    it('lists every setting with a description and type, grouped for the UI', async () => {
      const list = (await api().get('/api/v1/admin/settings').set(auth(admin)).expect(200)).body.data;
      expect(list.map((s: { key: string }) => s.key)).toEqual(expect.arrayContaining(['seller_approval_required', 'max_image_bytes', 'allowed_image_types', 'community_guidelines', 'support_email', 'listing_expiry_days']));
      expect(list.map((s: { key: string }) => s.key)).not.toContain('listing_moderation_required');
      expect(list.every((s: { label: string; group: string; type: string }) => s.label && s.group && s.type)).toBe(true);
    });
    it('validates values by type and range, and rejects unknown settings', async () => {
      await set('seller_approval_required', 'yes').expect(400);
      await set('max_images_per_listing', 0).expect(400);
      await set('max_images_per_listing', 99).expect(400);
      await set('max_images_per_listing', 2.5).expect(400);
      await set('max_image_bytes', 50_000_000).expect(400);
      await set('allowed_image_types', []).expect(400);
      await set('allowed_image_types', ['gif']).expect(400);
      await set('allowed_image_types', ['png', 'png']).expect(400);
      await set('support_email', 42).expect(400);
      await set('terms_text', 'x'.repeat(50_001)).expect(400);
      await set('not_a_setting', 1).expect(404);
      await api().patch('/api/v1/admin/settings/max_reports_per_day').set(auth(admin)).send({}).expect(400);
      await set('max_images_per_listing', 4).expect(200);
      expect((await pool.query(`SELECT value FROM platform_settings WHERE key = 'max_images_per_listing'`)).rows[0].value).toBe(4);
    });
    it('publishes submitted listings immediately without an admin moderation setting', async () => {
      const make = async () => {
        const id = (await api().post('/api/v1/products').set(auth(seller)).send({ title: 'Settings test phone', description: 'Testing live settings.', categorySlug: 'electronics', priceKobo: 500000, attributes: { brand: 'X' } }).expect(201)).body.data.id;
        await api().post(`/api/v1/products/${id}/images`).set(auth(seller)).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
        return id as string;
      };
      await set('listing_moderation_required', false).expect(404);
      expect((await api().post(`/api/v1/products/${await make()}/submit`).set(auth(seller)).expect(200)).body.data.status).toBe('published');
    });
    it('controls which image formats sellers may upload', async () => {
      const id = (await api().post('/api/v1/products').set(auth(seller)).send({ title: 'Format test phone', description: 'Testing allowed formats.', categorySlug: 'electronics', priceKobo: 500000, attributes: { brand: 'X' } }).expect(201)).body.data.id;
      await set('allowed_image_types', ['jpeg']).expect(200);
      const r = await api().post(`/api/v1/products/${id}/images`).set(auth(seller)).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(400);
      expect(r.body.message).toMatch(/PNG images are not accepted.*JPEG/);
      await set('allowed_image_types', ['jpeg', 'png']).expect(200);
      await api().post(`/api/v1/products/${id}/images`).set(auth(seller)).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
    });
    it('publishes site content and contact details through a public endpoint that never exposes internal settings', async () => {
      const empty = (await api().get('/api/v1/settings/public').expect(200)).body.data;
      expect(empty).toMatchObject({ community_guidelines: '', terms_text: '', support_email: '' }); // not published yet: nothing invented
      await set('community_guidelines', 'Be kind. No stolen goods.').expect(200);
      await set('support_email', 'help@example.com').expect(200);
      const pub = (await api().get('/api/v1/settings/public').expect(200)).body.data;
      expect(pub).toMatchObject({ community_guidelines: 'Be kind. No stolen goods.', support_email: 'help@example.com' });
      expect(Object.keys(pub).sort()).toEqual(['about_text', 'community_guidelines', 'privacy_text', 'support_email', 'support_phone', 'terms_text']);
      expect(JSON.stringify(pub)).not.toMatch(/max_|approval|moderation/);
    });
    it('records who changed what, with before and after values', async () => {
      await set('max_reports_per_day', 5).expect(200);
      await set('terms_text', 'x'.repeat(500)).expect(200);
      const logs = await audit('settings.update');
      expect(logs[0]).toMatchObject({ actor_id: ids['admin@example.com'], resource_id: 'max_reports_per_day', metadata: { before: 20, after: 5 } });
      expect(logs[1].metadata).toEqual({ length: 500 }); // long text is logged by size, not content
    });
  });

  describe('audit trail', () => {
    it('is visible to administrators only, filterable, and cannot be edited or deleted', async () => {
      await set('max_reports_per_day', 7).expect(200);
      await api().post(`/api/v1/admin/users/${ids['plain@example.com']}/roles`).set(auth(admin)).send({ role: 'moderator' }).expect(200);
      const all = (await api().get('/api/v1/admin/audit-logs').set(auth(admin)).expect(200)).body;
      expect(all.data.map((a: { action: string }) => a.action)).toEqual(['user.grant_moderator', 'settings.update']);
      expect(all.data[0]).toMatchObject({ actor: 'User admin', resourceType: 'user' });
      expect((await api().get('/api/v1/admin/audit-logs?action=settings').set(auth(admin))).body.data).toHaveLength(1);
      expect((await api().get(`/api/v1/admin/audit-logs?actorId=${ids['mod@example.com']}`).set(auth(admin))).body.data).toEqual([]);
      await api().get('/api/v1/admin/audit-logs?actorId=nope').set(auth(admin)).expect(400);
      await expect(pool.query(`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow(/append-only/);
      await expect(pool.query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
      expect((await pool.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n).toBe(2);
    });
  });
});
