import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(30_000); // setup hashes passwords (argon2) and can be slow on busy machines

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
const FILES_DIR = mkdtempSync(join(tmpdir(), 'sazu-e2e-'));
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_VERIFY_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_WRITE_LIMIT = '100000';
process.env.NODE_ENV = 'test';
process.env.STORAGE_LOCAL_DIR = FILES_DIR;
process.env.PUBLIC_FILES_BASE_URL = 'http://localhost:4000/files';

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { SellerAccountService } from '../src/sellers/seller-account.service';

const PASSWORD = 'correct-horse-battery';
const png = (w = 60, h = 40) => sharp({ create: { width: w, height: h, channels: 3, background: '#2255aa' } }).png().toBuffer();
const exists = (p: string) => access(p).then(() => true, () => false);
const diskPath = (url: string) => join(FILES_DIR, 'public', url.replace('http://localhost:4000/files/', ''));

describe('Seller tools (real PostgreSQL + real files on disk)', () => {
  let app: INestApplication;
  let pool: Pool;
  let sellers: SellerAccountService;
  const outbox: MailMessage[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function user(email: string, verify = true): Promise<string> {
    await api().post('/api/v1/auth/register').send({ fullName: 'Test User', displayName: `User ${email.split('@')[0]}`, email, password: PASSWORD, acceptTerms: true }).expect(202);
    if (verify) {
      const code = [...outbox].reverse().find((m) => m.to === email)!.text.match(/verification code:\s*\n\n(\d{8})/i)![1];
      await api().post('/api/v1/auth/verify-email').send({ email, code }).expect(204);
    }
    return (await api().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200)).body.data.accessToken;
  }
  /** Registers, applies, and approves (via the same review service the admin tooling will use). */
  async function approvedSeller(email: string, shopName = 'Test Shop'): Promise<{ token: string; sellerId: string }> {
    const token = await user(email);
    const res = await api().post('/api/v1/sellers/apply').set(auth(token)).send({ shopName, categorySlugs: ['electronics'] }).expect(201);
    await sellers.review(res.body.data.id, 'approve');
    return { token, sellerId: res.body.data.id };
  }
  const setSetting = (k: string, v: unknown) => pool.query('UPDATE platform_settings SET value = $2::jsonb WHERE key = $1', [k, JSON.stringify(v)]);
  const newProduct = (token: string, over: Record<string, unknown> = {}) =>
    api().post('/api/v1/products').set(auth(token)).send({
      title: 'Samsung Galaxy A14', description: 'Barely used, comes with the box and charger.', categorySlug: 'electronics',
      priceKobo: 12500000, condition: 'used_good', campusLocation: 'Hostel A', attributes: { brand: 'Samsung' }, ...over,
    });
  const addImage = (token: string, id: string, buf?: Buffer, filename = 'photo.png') =>
    api().post(`/api/v1/products/${id}/images`).set(auth(token)).attach('file', buf ?? Buffer.alloc(0), { filename, contentType: 'image/png' });
  async function readyProduct(token: string, over: Record<string, unknown> = {}): Promise<string> {
    const id = (await newProduct(token, over).expect(201)).body.data.id;
    await addImage(token, id, await png()).expect(201);
    return id;
  }
  const publish = (id: string) => pool.query(`UPDATE products SET status = 'published', published_at = now() WHERE id = $1`, [id]);

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
    await pool.query(`INSERT INTO platform_settings (key, value) VALUES ('seller_approval_required','true'),('require_listing_image','true'),
      ('max_images_per_listing','6'),('max_image_bytes','5242880'),('max_uploads_per_user_per_day','60'),('max_active_listings_per_seller','50'),('listing_expiry_days','0')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  });

  describe('seller application and approval', () => {
    it('requires sign-in and a verified email', async () => {
      await api().post('/api/v1/sellers/apply').send({ shopName: 'X Shop' }).expect(401);
      const unverified = await user('unverified@example.com', false);
      const r = await api().post('/api/v1/sellers/apply').set(auth(unverified)).send({ shopName: 'X Shop', categorySlugs: ['electronics'] }).expect(403);
      expect(r.body.message).toMatch(/Verify your email/);
    });

    it('creates a pending application, generates a unique slug, and stays out of public view until approved', async () => {
      const a = await user('a@example.com'); const b = await user('b@example.com');
      const first = await api().post('/api/v1/sellers/apply').set(auth(a)).send({ shopName: 'Aisha Tech', categorySlugs: ['electronics', 'student-services'] }).expect(201);
      const second = await api().post('/api/v1/sellers/apply').set(auth(b)).send({ shopName: 'Aisha Tech', categorySlugs: ['electronics'] }).expect(201);
      expect(first.body.data).toMatchObject({ status: 'pending', slug: 'aisha-tech' });
      expect(first.body.data.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(['electronics', 'student-services']);
      expect(second.body.data.slug).toMatch(/^aisha-tech-[0-9a-f]{6}$/);
      await api().get('/api/v1/sellers/aisha-tech').expect(404);
      expect((await api().get('/api/v1/sellers/me').set(auth(a)).expect(200)).body.data.status).toBe('pending');
      expect((await api().get('/api/v1/users/me').set(auth(a))).body.data.seller).toMatchObject({ status: 'pending', slug: 'aisha-tech' });
    });

    it('validates input, forbids duplicates, and protects reserved slugs', async () => {
      const t = await user('v@example.com');
      await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'A' }).expect(400);
      await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Good Shop' }).expect(400); // no category
      await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Good Shop', categorySlugs: ['nope'] }).expect(400);
      await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Good Shop', categorySlugs: ['electronics'], status: 'approved' }).expect(400); // mass assignment
      const r = await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Me', categorySlugs: ['electronics'] }).expect(201);
      expect(r.body.data.slug).toBe('me-shop');
      await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Again', categorySlugs: ['electronics'] }).expect(409);
    });

    it('supports drafts, submission, and resubmission after rejection with a reason', async () => {
      const t = await user('d@example.com');
      const d = await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Draft Shop', saveAsDraft: true }).expect(201);
      expect(d.body.data.status).toBe('draft');
      await api().post('/api/v1/sellers/me/submit').set(auth(t)).expect(400); // needs a category
      await api().patch('/api/v1/sellers/me').set(auth(t)).send({ categorySlugs: ['food-drinks'], description: 'Snacks' }).expect(200);
      expect((await api().post('/api/v1/sellers/me/submit').set(auth(t)).expect(200)).body.data.status).toBe('pending');
      await api().post('/api/v1/sellers/me/submit').set(auth(t)).expect(409);

      await expect(sellers.review(d.body.data.id, 'reject', '  ')).rejects.toThrow(/reason is required/);
      await sellers.review(d.body.data.id, 'reject', 'Please add a clearer shop description.');
      const rej = (await api().get('/api/v1/sellers/me').set(auth(t))).body.data;
      expect(rej).toMatchObject({ status: 'rejected', reviewNote: 'Please add a clearer shop description.' });
      await newProduct(t).expect(403);
      expect((await api().post('/api/v1/sellers/me/submit').set(auth(t)).expect(200)).body.data).toMatchObject({ status: 'pending', reviewNote: null });
    });

    it('auto-approves when approval is switched off in settings', async () => {
      await setSetting('seller_approval_required', false);
      const t = await user('auto@example.com');
      const r = await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Auto Shop', categorySlugs: ['electronics'] }).expect(201);
      expect(r.body.data.status).toBe('approved');
      expect((await pool.query(`SELECT 1 FROM user_roles WHERE role = 'seller'`)).rowCount).toBe(1);
      await api().get('/api/v1/sellers/auto-shop').expect(200);
    });

    it('approval grants the seller role; suspension removes it and hides all listings instantly', async () => {
      const { token, sellerId } = await approvedSeller('s@example.com', 'Suspend Me');
      expect((await pool.query(`SELECT count(*)::int AS n FROM user_roles WHERE role = 'seller'`)).rows[0].n).toBe(1);
      const id = await readyProduct(token); await publish(id);
      const slug = (await api().get(`/api/v1/seller/products/${id}`).set(auth(token))).body.data.slug;
      await api().get(`/api/v1/products/${slug}`).expect(200);
      await sellers.review(sellerId, 'suspend', 'Reported for counterfeit goods.');
      await api().get(`/api/v1/products/${slug}`).expect(404);
      await api().get('/api/v1/sellers/suspend-me').expect(404);
      await newProduct(token).expect(403);
      expect((await pool.query(`SELECT count(*)::int AS n FROM user_roles WHERE role = 'seller'`)).rows[0].n).toBe(0);
      await sellers.review(sellerId, 'reinstate');
      await api().get(`/api/v1/products/${slug}`).expect(200);
    });

    it('lets pending applicants publish listings without admin approval', async () => {
      const plain = await user('plain@example.com');
      expect((await newProduct(plain).expect(403)).body.message).toMatch(/Apply to become a seller/);
      await api().get('/api/v1/seller/dashboard').set(auth(plain)).expect(403);
      const pending = await user('pending@example.com');
      await api().post('/api/v1/sellers/apply').set(auth(pending)).send({ shopName: 'Pending', categorySlugs: ['electronics'] }).expect(201);
      const id = await readyProduct(pending);
      await api().get('/api/v1/seller/dashboard').set(auth(pending)).expect(200);
      expect((await api().post(`/api/v1/products/${id}/submit`).set(auth(pending)).expect(200)).body.data.status).toBe('published');
      const slug = (await api().get(`/api/v1/seller/products/${id}`).set(auth(pending))).body.data.slug;
      await api().get(`/api/v1/products/${slug}`).expect(200);
      await api().get('/api/v1/sellers/pending').expect(200);
      await newProduct('not-a-token').expect(401);
    });
  });

  describe('creating and editing listings', () => {
    let tok: string;
    beforeEach(async () => { tok = (await approvedSeller('seller@example.com')).token; });

    it('creates a draft with a unique slug and category fields; same title twice gets different slugs', async () => {
      const a = (await newProduct(tok).expect(201)).body.data;
      const b = (await newProduct(tok).expect(201)).body.data;
      expect(a).toMatchObject({ status: 'draft', priceKobo: 12500000, attributeValues: { brand: 'Samsung' }, availability: 'available' });
      expect(a.slug).toBe('samsung-galaxy-a14');
      expect(b.slug).toMatch(/^samsung-galaxy-a14-[0-9a-f]{6}$/);
      await api().get(`/api/v1/products/${a.slug}`).expect(404); // drafts are never public
    });

    it.each([
      ['price below ₦1', { priceKobo: 50 }], ['fractional price', { priceKobo: 100.5 }], ['absurd price', { priceKobo: 1e15 }], ['negative price', { priceKobo: -5 }],
      ['short title', { title: 'ab' }], ['short description', { description: 'tiny' }], ['unknown category', { categorySlug: 'nope' }],
      ['bad condition', { condition: 'mint' }], ['unknown attribute', { attributes: { hacked: 'x' } }], ['non-text attribute', { attributes: { brand: { a: 1 } } }],
      ['mass assignment', { status: 'published' }], ['mass assignment of seller', { sellerId: '00000000-0000-0000-0000-000000000000' }],
    ])('rejects %s', async (_n, over) => { await newProduct(tok, over as Record<string, unknown>).expect(400); });

    it('rejects an inactive category', async () => {
      await pool.query(`UPDATE categories SET is_active = false WHERE slug = 'furniture'`);
      await newProduct(tok, { categorySlug: 'furniture', attributes: undefined }).expect(400);
    });

    it('validates select, number and url fields from category definitions', async () => {
      await newProduct(tok, { categorySlug: 'books-study-materials', attributes: { format: 'Hologram' } }).expect(400);
      await newProduct(tok, { categorySlug: 'student-services', attributes: { pricing_basis: 'Per hour', portfolio_url: 'javascript:alert(1)' } }).expect(400);
      await newProduct(tok, { categorySlug: 'student-services', attributes: { pricing_basis: 'Per hour', portfolio_url: 'https://example.com/me' } }).expect(201);
      await pool.query(`INSERT INTO category_attributes (category_id, key, label, input_type, sort_order) SELECT id, 'ram_gb', 'RAM (GB)', 'number', 9 FROM categories WHERE slug = 'electronics'`);
      await newProduct(tok, { attributes: { brand: 'HP', ram_gb: 'lots' } }).expect(400);
      await newProduct(tok, { attributes: { brand: 'HP', ram_gb: '8' } }).expect(201);
      await pool.query(`DELETE FROM category_attributes WHERE key = 'ram_gb'`);
    });

    it('services have no condition', async () => {
      const r = await newProduct(tok, { categorySlug: 'student-services', productType: 'service', condition: 'new', attributes: { pricing_basis: 'Per project' } }).expect(201);
      expect(r.body.data.condition).toBeNull();
    });

    it('updates fields, supports clearing optional ones, and rejects bad edits', async () => {
      const id = (await newProduct(tok).expect(201)).body.data.id;
      const u = await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ priceKobo: 9900000, campusLocation: null, collectionInfo: 'Pick up at the gate' }).expect(200);
      expect(u.body.data).toMatchObject({ priceKobo: 9900000, campusLocation: null, collectionInfo: 'Pick up at the gate' });
      await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ priceKobo: 1 }).expect(400);
      await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ slug: 'hijack' }).expect(400);
      await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ productType: 'service' }).expect(200);
      await api().patch('/api/v1/products/not-a-uuid').set(auth(tok)).send({}).expect(400);
    });

    it('changing category drops attribute values that no longer apply', async () => {
      const id = (await newProduct(tok).expect(201)).body.data.id;
      const r = await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ categorySlug: 'furniture' }).expect(200);
      expect(r.body.data.attributeValues).toEqual({});
    });
  });

  describe('ownership: sellers cannot touch each other’s listings', () => {
    it('returns 404 for every read and mutation on someone else’s listing', async () => {
      const a = (await approvedSeller('a@example.com', 'Shop A')).token;
      const b = (await approvedSeller('b@example.com', 'Shop B')).token;
      const id = await readyProduct(a);
      const imageId = (await api().get(`/api/v1/seller/products/${id}`).set(auth(a))).body.data.images[0].id;
      const attempts: [string, string, object?][] = [
        ['get', `/api/v1/seller/products/${id}`], ['patch', `/api/v1/products/${id}`, { title: 'Hijacked title' }], ['delete', `/api/v1/products/${id}`],
        ['post', `/api/v1/products/${id}/submit`], ['post', `/api/v1/products/${id}/mark-sold`], ['post', `/api/v1/products/${id}/mark-unavailable`],
        ['post', `/api/v1/products/${id}/archive`], ['post', `/api/v1/products/${id}/restore`],
        ['delete', `/api/v1/products/${id}/images/${imageId}`], ['patch', `/api/v1/products/${id}/images/${imageId}`, { altText: 'x' }],
        ['put', `/api/v1/products/${id}/images/order`, { imageIds: [imageId] }],
      ];
      for (const [m, path, body] of attempts) {
        const res = await (api() as unknown as Record<string, (p: string) => request.Test>)[m]!(path).set(auth(b)).send(body);
        expect([m, path, res.status]).toEqual([m, path, 404]);
      }
      expect((await addImage(b, id, await png())).status).toBe(404);
      const list = await api().get('/api/v1/seller/products').set(auth(b)).expect(200);
      expect(list.body.data).toEqual([]);
      const row = (await pool.query('SELECT title, status FROM products WHERE id = $1', [id])).rows[0];
      expect(row).toMatchObject({ title: 'Samsung Galaxy A14', status: 'draft' });
      expect((await pool.query('SELECT count(*)::int AS n FROM product_images WHERE product_id = $1', [id])).rows[0].n).toBe(1);
    });
  });

  describe('listing lifecycle', () => {
    let tok: string;
    beforeEach(async () => { tok = (await approvedSeller('seller@example.com')).token; });

    it('reports every problem when a listing is incomplete', async () => {
      const id = (await newProduct(tok, { attributes: undefined }).expect(201)).body.data.id;
      const r = await api().post(`/api/v1/products/${id}/submit`).set(auth(tok)).expect(400);
      expect(r.body.message).toEqual(expect.arrayContaining(['Add at least one photo.', 'Fill in "Brand".']));
    });

    it('submitting publishes immediately and makes the listing searchable', async () => {
      const id = await readyProduct(tok);
      const sub = await api().post(`/api/v1/products/${id}/submit`).set(auth(tok)).expect(200);
      expect(sub.body.data.status).toBe('published');
      const slug = sub.body.data.slug;
      await api().get(`/api/v1/products/${slug}`).expect(200);
      const pub = await api().get(`/api/v1/products/${slug}`).expect(200);
      expect(pub.body.data.images[0].url).toMatch(/\/files\/products\/.+\.webp$/);
      expect((await api().get('/api/v1/products?q=samsung')).body.data).toHaveLength(1);
      expect((await api().get('/api/v1/categories')).body.data.find((c: { slug: string }) => c.slug === 'electronics').productCount).toBe(1);
    });

    it('publishes immediately and applies listing expiry', async () => {
      await setSetting('listing_expiry_days', 30);
      const id = await readyProduct(tok);
      const r = (await api().post(`/api/v1/products/${id}/submit`).set(auth(tok)).expect(200)).body.data;
      expect(r.status).toBe('published');
      await api().get(`/api/v1/products/${r.slug}`).expect(200);
      const exp = (await pool.query(`SELECT expires_at > now() + interval '29 days' AS ok FROM products WHERE id = $1`, [id])).rows[0];
      expect(exp.ok).toBe(true);
    });

    it('keeps listings public when sellers make material edits', async () => {
      const id = await readyProduct(tok); await publish(id);
      const slug = (await api().get(`/api/v1/seller/products/${id}`).set(auth(tok))).body.data.slug;
      expect((await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ priceKobo: 11000000 }).expect(200)).body.data.status).toBe('published');
      await api().get(`/api/v1/products/${slug}`).expect(200);
      expect((await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ title: 'Completely different phone' }).expect(200)).body.data.status).toBe('published');
      await api().get(`/api/v1/products/${slug}`).expect(200);
    });

    it('availability changes only apply to published listings and show up publicly', async () => {
      const id = await readyProduct(tok);
      await api().post(`/api/v1/products/${id}/mark-sold`).set(auth(tok)).expect(409);
      await publish(id);
      const slug = (await api().get(`/api/v1/seller/products/${id}`).set(auth(tok))).body.data.slug;
      expect((await api().post(`/api/v1/products/${id}/mark-reserved`).set(auth(tok)).expect(200)).body.data.availability).toBe('reserved');
      expect((await api().post(`/api/v1/products/${id}/mark-sold`).set(auth(tok)).expect(200)).body.data.availability).toBe('sold');
      const page = await api().get(`/api/v1/products/${slug}`).expect(200);
      expect(page.body.data.canContact).toEqual({ allowed: false, reason: 'This item has been sold.' });
      expect((await api().get('/api/v1/products')).body.data).toEqual([]); // sold items leave default browsing
      await api().post(`/api/v1/products/${id}/mark-unavailable`).set(auth(tok)).expect(200);
      await api().post(`/api/v1/products/${id}/mark-available`).set(auth(tok)).expect(200);
      expect((await api().get('/api/v1/products')).body.data).toHaveLength(1);
    });

    it('archive hides a listing, blocks editing, and restore returns it as a draft', async () => {
      const id = await readyProduct(tok); await publish(id);
      const slug = (await api().get(`/api/v1/seller/products/${id}`).set(auth(tok))).body.data.slug;
      await api().post(`/api/v1/products/${id}/archive`).set(auth(tok)).expect(200);
      await api().get(`/api/v1/products/${slug}`).expect(404);
      await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ priceKobo: 200 }).expect(409);
      await addImage(tok, id, await png()).expect(409);
      const r = (await api().post(`/api/v1/products/${id}/restore`).set(auth(tok)).expect(200)).body.data;
      expect(r).toMatchObject({ status: 'draft', availability: 'available' });
      await api().post(`/api/v1/products/${id}/restore`).set(auth(tok)).expect(409);
    });

    it('moderator-removed listings cannot be edited, restored or archived by the seller', async () => {
      const id = await readyProduct(tok);
      await pool.query(`UPDATE products SET status = 'removed' WHERE id = $1`, [id]);
      await api().patch(`/api/v1/products/${id}`).set(auth(tok)).send({ priceKobo: 200 }).expect(409);
      await api().post(`/api/v1/products/${id}/restore`).set(auth(tok)).expect(409);
      await api().post(`/api/v1/products/${id}/archive`).set(auth(tok)).expect(409);
      await api().post(`/api/v1/products/${id}/submit`).set(auth(tok)).expect(409);
    });

    it('a rejected listing shows the reason and can be fixed and resubmitted', async () => {
      const id = await readyProduct(tok);
      await pool.query(`UPDATE products SET status = 'rejected', rejection_reason = 'Photos are too dark.' WHERE id = $1`, [id]);
      const r = (await api().get(`/api/v1/seller/products/${id}`).set(auth(tok))).body.data;
      expect(r).toMatchObject({ status: 'rejected', rejectionReason: 'Photos are too dark.' });
      const again = (await api().post(`/api/v1/products/${id}/submit`).set(auth(tok)).expect(200)).body.data;
      expect(again).toMatchObject({ status: 'published', rejectionReason: null });
    });

    it('deletes only never-published listings and removes their files', async () => {
      const draft = await readyProduct(tok);
      const files = (await api().get(`/api/v1/seller/products/${draft}`).set(auth(tok))).body.data.images.map((i: { url: string }) => diskPath(i.url));
      expect(await exists(files[0])).toBe(true);
      await api().delete(`/api/v1/products/${draft}`).set(auth(tok)).expect(204);
      expect(await exists(files[0])).toBe(false);
      await api().get(`/api/v1/seller/products/${draft}`).set(auth(tok)).expect(404);

      const live = await readyProduct(tok); await publish(live);
      expect((await api().delete(`/api/v1/products/${live}`).set(auth(tok)).expect(409)).body.message).toMatch(/Archive it instead/);
      await api().post(`/api/v1/products/${live}/archive`).set(auth(tok)).expect(200);
      await api().delete(`/api/v1/products/${live}`).set(auth(tok)).expect(409); // was published: kept for moderation history

      const pending = await readyProduct(tok);
      await api().post(`/api/v1/products/${pending}/submit`).set(auth(tok)).expect(200);
      await api().delete(`/api/v1/products/${pending}`).set(auth(tok)).expect(409);
      const spare = await readyProduct(tok);
      await api().post(`/api/v1/products/${spare}/archive`).set(auth(tok)).expect(200);
      await api().delete(`/api/v1/products/${spare}`).set(auth(tok)).expect(204);
    });

    it('enforces the per-seller active listing cap', async () => {
      await setSetting('max_active_listings_per_seller', 1);
      const one = await readyProduct(tok); const two = await readyProduct(tok, { title: 'Second phone' });
      await api().post(`/api/v1/products/${one}/submit`).set(auth(tok)).expect(200);
      expect((await api().post(`/api/v1/products/${two}/submit`).set(auth(tok)).expect(409)).body.message).toMatch(/at most 1 active/);
    });

    it('lists my listings by status with real counts on the dashboard', async () => {
      const a = await readyProduct(tok); await publish(a);
      const b = await readyProduct(tok, { title: 'Sold thing' }); await publish(b); await api().post(`/api/v1/products/${b}/mark-sold`).set(auth(tok));
      await newProduct(tok, { title: 'Just a draft' });
      const c = await readyProduct(tok, { title: 'Published thing' }); await api().post(`/api/v1/products/${c}/submit`).set(auth(tok));
      const slugA = (await api().get(`/api/v1/seller/products/${a}`).set(auth(tok))).body.data.slug;
      await api().post(`/api/v1/products/${slugA}/views`).set('User-Agent', 'x').expect(204);
      const d = (await api().get('/api/v1/seller/dashboard').set(auth(tok)).expect(200)).body.data;
      expect(d.counts).toEqual({ active: 2, pendingReview: 0, sold: 1, unavailable: 0, draft: 1, rejected: 0, archived: 0 });
      expect(d.views30d).toBe(1);
      expect(d.topListings).toEqual([{ id: a, slug: slugA, title: 'Samsung Galaxy A14', views: 1 }]);
      const sold = await api().get('/api/v1/seller/products?status=sold').set(auth(tok)).expect(200);
      expect(sold.body.data.map((x: { id: string }) => x.id)).toEqual([b]);
      expect((await api().get('/api/v1/seller/products').set(auth(tok))).body.meta.total).toBe(4);
      await api().get('/api/v1/seller/products?status=bogus').set(auth(tok)).expect(400);
    });
  });

  describe('image uploads', () => {
    let tok: string; let id: string;
    beforeEach(async () => { tok = (await approvedSeller('seller@example.com')).token; id = (await newProduct(tok).expect(201)).body.data.id; });

    it('accepts PNG, JPEG and WebP; stores re-encoded WebP main + thumbnail; serves them with safe headers', async () => {
      const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#aa3311' } }).jpeg().toBuffer();
      const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#33aa11' } }).webp().toBuffer();
      for (const [buf, name] of [[await png(), 'a.png'], [jpeg, 'b.jpg'], [webp, 'c.webp']] as const) {
        const r = await addImage(tok, id, buf, name).expect(201);
        expect(r.body.data.url).toMatch(new RegExp(`/files/products/${id}/[0-9a-f-]{36}\\.webp$`));
        expect(await exists(diskPath(r.body.data.url))).toBe(true);
        expect(await exists(diskPath(r.body.data.thumbUrl))).toBe(true);
      }
      const detail = (await api().get(`/api/v1/seller/products/${id}`).set(auth(tok))).body.data;
      expect(detail.images.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([1, 2, 3]);
      const served = await api().get(new URL(detail.images[0].url).pathname).expect(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
    });

    it('strips EXIF metadata from stored files', async () => {
      const withExif = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#445566' } }).jpeg().withExif({ IFD0: { Copyright: 'private-owner-name' } }).toBuffer();
      const r = await addImage(tok, id, withExif, 'phone.jpg').expect(201);
      const stored = await readFile(diskPath(r.body.data.url));
      expect((await sharp(stored).metadata()).exif).toBeUndefined();
      expect(stored.toString('latin1')).not.toContain('private-owner-name');
    });

    it('never trusts the file name, extension, or declared type', async () => {
      await addImage(tok, id, Buffer.from('just some text, not an image'), 'fake.jpg').expect(400);
      await addImage(tok, id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.png').expect(400);
      await addImage(tok, id, Buffer.from('GIF89a' + 'x'.repeat(40)), 'anim.png').expect(400);
      await addImage(tok, id, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('corrupt corrupt corrupt')]), 'bad.png').expect(400);
      await addImage(tok, id).expect(400); // empty file
      await api().post(`/api/v1/products/${id}/images`).set(auth(tok)).expect(400); // no file at all
      const r = await addImage(tok, id, await png(), '../../../../etc/evil.png').expect(201); // traversal-looking name is ignored
      expect(r.body.data.url).toContain(`/products/${id}/`);
      expect(r.body.data.url).not.toContain('evil');
      expect((await pool.query('SELECT count(*)::int AS n FROM product_images')).rows[0].n).toBe(1);
    });

    it('enforces size, per-listing and daily limits from platform settings', async () => {
      await setSetting('max_image_bytes', 500);
      const big = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#000' } }).png().toBuffer();
      expect(big.length).toBeGreaterThan(500);
      await addImage(tok, id, big).expect(413);
      await setSetting('max_image_bytes', 5242880); await setSetting('max_images_per_listing', 2);
      await addImage(tok, id, await png()).expect(201); await addImage(tok, id, await png()).expect(201);
      expect((await addImage(tok, id, await png()).expect(409)).body.message).toMatch(/at most 2 photos/);
      await setSetting('max_images_per_listing', 6); await setSetting('max_uploads_per_user_per_day', 2);
      await addImage(tok, id, await png()).expect(403);
    });

    it('requires authentication', async () => {
      await api().post(`/api/v1/products/${id}/images`).attach('file', await png(), 'a.png').expect(401);
    });

    it('reorders photos (first is the cover), edits descriptions, and rejects partial or foreign id lists', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push((await addImage(tok, id, await png(60 + i)).expect(201)).body.data.id);
      const r = await api().put(`/api/v1/products/${id}/images/order`).set(auth(tok)).send({ imageIds: [ids[2], ids[0], ids[1]] }).expect(200);
      expect(r.body.data.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
      await api().put(`/api/v1/products/${id}/images/order`).set(auth(tok)).send({ imageIds: [ids[0], ids[1]] }).expect(400);
      await api().put(`/api/v1/products/${id}/images/order`).set(auth(tok)).send({ imageIds: [ids[0], ids[1], '3b241101-e2bb-4255-8caf-4136c566a962'] }).expect(400);
      await api().put(`/api/v1/products/${id}/images/order`).set(auth(tok)).send({ imageIds: [ids[0], ids[0], ids[1]] }).expect(400);
      const alt = await api().patch(`/api/v1/products/${id}/images/${ids[0]}`).set(auth(tok)).send({ altText: 'Front of the phone' }).expect(200);
      expect(alt.body.data.find((i: { id: string }) => i.id === ids[0]).alt).toBe('Front of the phone');
    });

    it('deleting a photo removes its files; the last photo of a live listing cannot be removed', async () => {
      const a = (await addImage(tok, id, await png()).expect(201)).body.data;
      const b = (await addImage(tok, id, await png(70)).expect(201)).body.data;
      await api().delete(`/api/v1/products/${id}/images/${a.id}`).set(auth(tok)).expect(204);
      expect(await exists(diskPath(a.url))).toBe(false);
      expect(await exists(diskPath(a.thumbUrl))).toBe(false);
      await api().delete(`/api/v1/products/${id}/images/${a.id}`).set(auth(tok)).expect(404);
      await publish(id);
      expect((await api().delete(`/api/v1/products/${id}/images/${b.id}`).set(auth(tok)).expect(409)).body.message).toMatch(/at least one photo/);
      expect(await exists(diskPath(b.url))).toBe(true);
    });

    it('changing photos on a live listing sends it back to review (when moderation is on)', async () => {
      await addImage(tok, id, await png()).expect(201); await publish(id);
      await addImage(tok, id, await png(90)).expect(201);
      expect((await pool.query('SELECT status FROM products WHERE id = $1', [id])).rows[0].status).toBe('pending_review');
    });
  });

  describe('profile images', () => {
    it('stores a square avatar, replaces and deletes the old file, and rejects non-images', async () => {
      const t = await user('me@example.com');
      await api().post('/api/v1/users/me/avatar').set(auth(t)).attach('file', Buffer.from('not an image'), 'a.png').expect(400);
      const first = (await api().post('/api/v1/users/me/avatar').set(auth(t)).attach('file', await png(300, 200), 'a.png').expect(200)).body.data.profile.avatarUrl;
      expect(first).toMatch(/\/files\/avatars\/users\/.+\.webp$/);
      const meta = await sharp(await readFile(diskPath(first))).metadata();
      expect([meta.width, meta.height]).toEqual([400, 400]);
      const second = (await api().post('/api/v1/users/me/avatar').set(auth(t)).attach('file', await png(), 'b.png').expect(200)).body.data.profile.avatarUrl;
      expect(second).not.toBe(first);
      expect(await exists(diskPath(first))).toBe(false);
      expect(await exists(diskPath(second))).toBe(true);
      await api().post('/api/v1/users/me/avatar').attach('file', await png(), 'b.png').expect(401);
    });

    it('lets a seller set a shop image shown on the public storefront, and edit shop details', async () => {
      const { token } = await approvedSeller('shop@example.com', 'Pic Shop');
      const r = await api().post('/api/v1/sellers/me/avatar').set(auth(token)).attach('file', await png(), 'logo.png').expect(200);
      expect(r.body.data.avatarUrl).toMatch(/\/files\/avatars\/shops\//);
      await api().patch('/api/v1/sellers/me').set(auth(token)).send({ description: 'Quality gadgets', publicLocation: 'Hostel B' }).expect(200);
      const store = (await api().get('/api/v1/sellers/pic-shop').expect(200)).body.data;
      expect(store).toMatchObject({ shopName: 'Pic Shop', description: 'Quality gadgets', location: 'Hostel B', verified: false });
      expect(store.avatarUrl).toBe(r.body.data.avatarUrl);
      expect(JSON.stringify(store)).not.toMatch(/contactPreferences|preferredCampusArea|reviewNote/);
    });
  });
});
