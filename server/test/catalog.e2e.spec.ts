import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { join } from 'node:path';

jest.setTimeout(30_000); // setup hashes passwords (argon2) and can be slow on busy machines

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '100000';
process.env.NODE_ENV = 'test';

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Public catalog (real PostgreSQL)', () => {
  let app: INestApplication;
  let pool: Pool;
  const api = () => request(app.getHttpServer());

  let sellerId: string; let pendingSellerId: string; let userId: string;
  const cat: Record<string, string> = {};

  async function product(over: Record<string, unknown> = {}): Promise<string> {
    const p = { slug: `item-${Math.random().toString(36).slice(2, 10)}`, title: 'Sample item', description: 'A sample description', price: 100000,
      cat: 'electronics', seller: sellerId, status: 'published', availability: 'available', condition: 'used_good', location: 'Main Gate',
      type: 'product', published: "now() - interval '1 hour'", expires: null as string | null, ...over };
    const r = await pool.query(
      `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, product_type, condition, availability, status, campus_location, published_at, expires_at)
       VALUES ($1, (SELECT id FROM categories WHERE slug = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, ${p.published}, ${p.expires ?? 'NULL'}) RETURNING id`,
      [p.seller, p.cat, p.slug, p.title, p.description, p.price, p.type, p.condition, p.availability, p.status, p.location],
    );
    (product as unknown as { last: string }).last = p.slug;
    return r.rows[0].id;
  }
  const slugOf = () => (product as unknown as { last: string }).last;
  const PRIVATE_KEYS = ['email', 'phone', 'userId', 'user_id', 'passwordHash', 'password_hash', 'preferredCampusArea', 'preferred_campus_area', 'status', 'verifiedAt'];
  const allKeys = (v: unknown): string[] =>
    Array.isArray(v) ? v.flatMap(allKeys) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...allKeys(x)]) : [];
  const expectNoPrivateData = (body: unknown) => {
    expect(allKeys(body).filter((k) => PRIVATE_KEYS.includes(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('seller@example.com');
  };
  const titles = (res: request.Response) => res.body.data.map((x: { title: string }) => x.title);

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); await pool.end(); });

  beforeEach(async () => {
    await pool.query('TRUNCATE users CASCADE');
    await pool.query(`DELETE FROM categories WHERE parent_id IS NOT NULL`);
    await pool.query(`UPDATE categories SET is_active = true`);
    for (const slug of ['electronics', 'books-study-materials', 'food-drinks', 'student-services']) {
      cat[slug] = (await pool.query('SELECT id FROM categories WHERE slug = $1', [slug])).rows[0].id;
    }
    const mkUser = async (email: string) => (await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, '!') RETURNING id`, [email])).rows[0].id as string;
    userId = await mkUser('seller@example.com');
    const approved = await pool.query(
      `INSERT INTO seller_profiles (user_id, slug, shop_name, description, public_location, status, approved_at, verified_at)
       VALUES ($1, 'aisha-tech', 'Aisha Tech', 'Phones and chargers', 'Hostel B', 'approved', now(), now()) RETURNING id`, [userId]);
    sellerId = approved.rows[0].id;
    const u2 = await mkUser('pending@example.com');
    pendingSellerId = (await pool.query(
      `INSERT INTO seller_profiles (user_id, slug, shop_name, status) VALUES ($1, 'new-shop', 'New Shop', 'pending') RETURNING id`, [u2])).rows[0].id;
  });

  describe('visibility rules', () => {
    it('is fully public: no authentication needed', async () => {
      await product({ title: 'Visible phone' });
      await api().get('/api/v1/products').expect(200);
      await api().get('/api/v1/categories').expect(200);
      await api().get(`/api/v1/products/${slugOf()}`).expect(200);
    });

    it.each(['draft', 'pending_review', 'rejected', 'archived', 'removed'])('hides %s listings from search and detail', async (status) => {
      await product({ title: 'Hidden one', status });
      const slug = slugOf();
      const list = await api().get('/api/v1/products').expect(200);
      expect(titles(list)).not.toContain('Hidden one');
      await api().get(`/api/v1/products/${slug}`).expect(404);
    });

    it('shows admin-approved listings from pending sellers but hides suspended sellers', async () => {
      await product({ title: 'From pending seller', seller: pendingSellerId });
      const pendingSlug = slugOf();
      expect(titles(await api().get('/api/v1/products'))).toContain('From pending seller');
      await api().get(`/api/v1/products/${pendingSlug}`).expect(200);
      await pool.query(`UPDATE seller_profiles SET status = 'suspended' WHERE id = $1`, [sellerId]);
      await product({ title: 'From suspended seller' });
      expect(titles(await api().get('/api/v1/products'))).not.toContain('From suspended seller');
    });

    it('hides expired listings and listings in disabled categories', async () => {
      await product({ title: 'Expired', expires: "now() - interval '1 day'" });
      await product({ title: 'Future expiry', expires: "now() + interval '1 day'" });
      await product({ title: 'In disabled category', cat: 'food-drinks' });
      await pool.query(`UPDATE categories SET is_active = false WHERE slug = 'food-drinks'`);
      expect(titles(await api().get('/api/v1/products'))).toEqual(['Future expiry']);
    });

    it('excludes sold items from default browsing but still serves their page with a clear state', async () => {
      await product({ title: 'Sold laptop', availability: 'sold' });
      const slug = slugOf();
      await product({ title: 'Reserved phone', availability: 'reserved' });
      await product({ title: 'Available charger' });
      expect(titles(await api().get('/api/v1/products')).sort()).toEqual(['Available charger', 'Reserved phone']);
      expect(titles(await api().get('/api/v1/products?availability=sold'))).toEqual(['Sold laptop']);
      const detail = await api().get(`/api/v1/products/${slug}`).expect(200);
      expect(detail.body.data.availability).toBe('sold');
      expect(detail.body.data.canContact).toEqual({ allowed: false, reason: 'This item has been sold.' });
    });
  });

  describe('product detail', () => {
    it('returns rich public data and never private seller or user data', async () => {
      const id = await product({ title: 'Samsung Galaxy A14', description: 'Barely used, with box.', price: 12500050, cat: 'electronics' });
      const slug = slugOf();
      await pool.query(`INSERT INTO product_images (product_id, storage_path, alt_text, sort_order) VALUES ($1, 'p/b.jpg', 'Back', 2), ($1, 'p/a.jpg', 'Front', 1)`, [id]);
      await pool.query(`INSERT INTO product_attribute_values (product_id, attribute_id, value)
        SELECT $1, id, 'Samsung' FROM category_attributes WHERE category_id = $2 AND key = 'brand'`, [id, cat['electronics']]);
      await pool.query(`UPDATE users SET last_login_at = now() - interval '2 hours' WHERE id = $1`, [userId]);
      const res = await api().get(`/api/v1/products/${slug}`).expect(200);
      const d = res.body.data;
      expect(d).toMatchObject({ title: 'Samsung Galaxy A14', priceKobo: 12500050, availability: 'available', canContact: { allowed: true } });
      expect(d.images.map((i: { alt: string }) => i.alt)).toEqual(['Front', 'Back']);
      expect(d.images[0].url).toMatch(/\/files\/p\/a\.jpg$/);
      expect(d.specifications).toEqual([{ label: 'Brand', value: 'Samsung', type: 'text' }]);
      expect(d.seller).toMatchObject({ slug: 'aisha-tech', shopName: 'Aisha Tech', verified: true, location: 'Hostel B', activityStatus: 'today' });
      expect(d.seller).not.toHaveProperty('lastLoginAt');
      expectNoPrivateData(res.body);
    });
    it('does not claim verification for unverified sellers', async () => {
      await pool.query(`UPDATE seller_profiles SET verified_at = NULL WHERE id = $1`, [sellerId]);
      await product({});
      const res = await api().get(`/api/v1/products/${slugOf()}`).expect(200);
      expect(res.body.data.seller.verified).toBe(false);
    });
    it('404s for unknown or malformed slugs without erroring', async () => {
      await api().get('/api/v1/products/does-not-exist').expect(404);
      await api().get('/api/v1/products/%27%3B%20DROP%20TABLE%20products%3B--').expect(404);
    });
  });

  describe('recommendations', () => {
    it('can exclude the current seller while keeping similar listings from other sellers', async () => {
      await product({ title: 'Current seller bedding' });
      const currentSellerSlug = slugOf();
      const otherUserId = (await pool.query(
        `INSERT INTO users (email, password_hash) VALUES ('other-seller@example.com', '!') RETURNING id`,
      )).rows[0].id as string;
      const otherSellerId = (await pool.query(
        `INSERT INTO seller_profiles (user_id, slug, shop_name, status, approved_at)
         VALUES ($1, 'other-shop', 'Other Shop', 'approved', now()) RETURNING id`,
        [otherUserId],
      )).rows[0].id as string;
      await product({ title: 'Other seller bedding', seller: otherSellerId });

      const recommendations = await api().get(
        `/api/v1/products?category=electronics&exclude=${currentSellerSlug}&excludeSeller=aisha-tech`,
      ).expect(200);
      expect(titles(recommendations)).toEqual(['Other seller bedding']);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await product({ title: 'Calculus textbook', description: 'Stewart, 8th edition, great for MTH101', cat: 'books-study-materials', price: 800000 });
      await product({ title: 'iPhone charger', description: 'Fast charging cable', price: 350000 });
      await product({ title: 'Jollof rice and chicken', description: 'Freshly cooked, pickup at the cafeteria', cat: 'food-drinks', price: 150000 });
    });
    it('matches titles, descriptions and partial words', async () => {
      expect(titles(await api().get('/api/v1/products?q=calculus'))).toEqual(['Calculus textbook']);
      expect(titles(await api().get('/api/v1/products?q=MTH101'))).toEqual(['Calculus textbook']);
      expect(titles(await api().get('/api/v1/products?q=char'))).toEqual(['iPhone charger']);
      expect(titles(await api().get('/api/v1/products?q=cafeteria'))).toEqual(['Jollof rice and chicken']);
    });
    it('ranks title matches first when sorting by relevance', async () => {
      await product({ title: 'Desk lamp', description: 'Works great with any charger socket', price: 200000 });
      const res = await api().get('/api/v1/products?q=charger&sort=relevance').expect(200);
      expect(titles(res)[0]).toBe('iPhone charger');
    });
    it('treats SQL and LIKE metacharacters as plain text', async () => {
      for (const q of ["'; DROP TABLE products; --", '%', '_', '\\', '" OR 1=1 --', 'a & | ! ( )']) {
        const res = await api().get(`/api/v1/products?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      }
      expect((await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n).toBe(3);
    });
    it('rejects over-long queries', async () => {
      await api().get(`/api/v1/products?q=${'a'.repeat(101)}`).expect(400);
    });
  });

  describe('filters, sorting and pagination', () => {
    beforeEach(async () => {
      await product({ title: 'A cheap', price: 100000, condition: 'new', location: 'Hostel A', cat: 'electronics' });
      await product({ title: 'B mid', price: 500000, condition: 'used_good', location: 'Library', cat: 'books-study-materials' });
      await product({ title: 'C pricey', price: 900000, condition: 'like_new', location: 'Hostel A', cat: 'electronics', type: 'service' });
    });
    it('filters by price range (kobo, inclusive)', async () => {
      expect(titles(await api().get('/api/v1/products?minPriceKobo=500000&maxPriceKobo=900000&sort=price_asc'))).toEqual(['B mid', 'C pricey']);
    });
    it('filters by condition, type, location and category', async () => {
      expect(titles(await api().get('/api/v1/products?condition=new'))).toEqual(['A cheap']);
      expect(titles(await api().get('/api/v1/products?type=service'))).toEqual(['C pricey']);
      expect(titles(await api().get('/api/v1/products?location=hostel%20a&sort=price_asc'))).toEqual(['A cheap', 'C pricey']);
      expect(titles(await api().get('/api/v1/products?category=books-study-materials'))).toEqual(['B mid']);
    });
    it('a parent category includes its subcategories', async () => {
      await pool.query(`INSERT INTO categories (parent_id, slug, name) VALUES ($1, 'phones', 'Phones')`, [cat['electronics']]);
      await product({ title: 'D phone', price: 300000, cat: 'phones' });
      expect(titles(await api().get('/api/v1/products?category=phones'))).toEqual(['D phone']);
      expect(titles(await api().get('/api/v1/products?category=electronics&sort=price_asc'))).toEqual(['A cheap', 'D phone', 'C pricey']);
      const tree = await api().get('/api/v1/categories').expect(200);
      const electronics = tree.body.data.find((c: { slug: string }) => c.slug === 'electronics');
      expect(electronics.children[0]).toMatchObject({ slug: 'phones', productCount: 1 });
      expect(electronics.productCount).toBe(3);
    });
    it('filters by seller and excludes a given slug', async () => {
      expect((await api().get('/api/v1/products?seller=aisha-tech')).body.meta.total).toBe(3);
      expect((await api().get('/api/v1/products?seller=new-shop')).body.meta.total).toBe(0);
      expect(titles(await api().get(`/api/v1/products?seller=aisha-tech&exclude=${slugOf()}&sort=price_asc`))).toEqual(['A cheap', 'B mid']);
    });
    it('sorts by price and newest', async () => {
      expect(titles(await api().get('/api/v1/products?sort=price_desc'))).toEqual(['C pricey', 'B mid', 'A cheap']);
      await pool.query(`UPDATE products SET published_at = now() WHERE title = 'A cheap'`);
      expect(titles(await api().get('/api/v1/products?sort=newest'))[0]).toBe('A cheap');
    });
    it('paginates with accurate metadata', async () => {
      const p1 = await api().get('/api/v1/products?pageSize=2&page=1&sort=price_asc').expect(200);
      const p2 = await api().get('/api/v1/products?pageSize=2&page=2&sort=price_asc').expect(200);
      const p3 = await api().get('/api/v1/products?pageSize=2&page=3&sort=price_asc').expect(200);
      expect(p1.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(titles(p1)).toEqual(['A cheap', 'B mid']);
      expect(titles(p2)).toEqual(['C pricey']);
      expect(p3.body.data).toEqual([]);
    });
    it.each(['minPriceKobo=-1', 'maxPriceKobo=abc', 'pageSize=1000', 'page=0', 'sort=hax', 'condition=broken', 'category=Bad Slug!', 'unknownParam=1'])(
      'rejects invalid input: %s', async (qs) => { await api().get(`/api/v1/products?${qs}`).expect(400); });
  });

  describe('views and popularity', () => {
    it('records one view per viewer per hour and ranks "popular" only by real views', async () => {
      await product({ title: 'Unviewed' });
      await product({ title: 'Viewed' });
      const slug = slugOf();
      expect((await api().get('/api/v1/products?sort=popular')).body.data).toEqual([]);
      await api().post(`/api/v1/products/${slug}/views`).set('User-Agent', 'ua-1').expect(204);
      await api().post(`/api/v1/products/${slug}/views`).set('User-Agent', 'ua-1').expect(204);
      await api().post(`/api/v1/products/${slug}/views`).set('User-Agent', 'ua-2').expect(204);
      expect((await pool.query('SELECT count(*)::int AS n FROM product_views')).rows[0].n).toBe(2);
      expect(titles(await api().get('/api/v1/products?sort=popular'))).toEqual(['Viewed']);
      expect((await api().get(`/api/v1/products/${slug}`)).body.data.viewCount).toBe(2);
    });
    it('ignores views of unpublished or unknown listings', async () => {
      await product({ status: 'draft' });
      await api().post(`/api/v1/products/${slugOf()}/views`).expect(204);
      await api().post('/api/v1/products/nope/views').expect(204);
      expect((await pool.query('SELECT count(*)::int AS n FROM product_views')).rows[0].n).toBe(0);
    });
  });

  describe('categories', () => {
    it('lists all ten brief categories with real counts and hides disabled ones', async () => {
      await product({ cat: 'food-drinks' });
      await product({ status: 'draft', cat: 'food-drinks' });
      const res = await api().get('/api/v1/categories').expect(200);
      expect(res.body.data).toHaveLength(10);
      expect(res.body.data.find((c: { slug: string }) => c.slug === 'food-drinks').productCount).toBe(1);
      expect(res.body.data.find((c: { slug: string }) => c.slug === 'electronics').productCount).toBe(0);
      await pool.query(`UPDATE categories SET is_active = false WHERE slug = 'furniture'`);
      expect((await api().get('/api/v1/categories')).body.data).toHaveLength(9);
      await api().get('/api/v1/categories/furniture').expect(404);
    });
    it('exposes category-specific fields', async () => {
      const res = await api().get('/api/v1/categories/food-drinks').expect(200);
      expect(res.body.data.attributes.map((a: { key: string }) => a.key)).toEqual(
        expect.arrayContaining(['ingredients', 'allergens', 'portion']));
    });
  });

  describe('seller storefront and sitemap', () => {
    it('shows an approved seller with only public fields', async () => {
      await product({ title: 'Product one' });
      await product({ title: 'Product two', availability: 'sold' });
      const res = await api().get('/api/v1/sellers/aisha-tech').expect(200);
      expect(res.body.data).toMatchObject({ shopName: 'Aisha Tech', verified: true, location: 'Hostel B', activeProductCount: 1 });
      expect(res.body.data.categories).toEqual([{ slug: 'electronics', name: 'Electronics' }]);
      expectNoPrivateData(res.body);
    });
    it('404s for non-approved sellers', async () => {
      await api().get('/api/v1/sellers/new-shop').expect(404);
      await api().get('/api/v1/sellers/nobody').expect(404);
    });
    it('sitemap contains only publicly visible items', async () => {
      await product({ title: 'Public' }); const pub = slugOf();
      await product({ title: 'Draft', status: 'draft' });
      const res = await api().get('/api/v1/sitemap').expect(200);
      expect(res.body.data.products.map((p: { slug: string }) => p.slug)).toEqual([pub]);
      expect(res.body.data.sellers.map((s: { slug: string }) => s.slug)).toEqual(['aisha-tech']);
    });
  });
});
