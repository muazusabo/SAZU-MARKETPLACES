/**
 * DEVELOPMENT ONLY sample data so the UI can be seen before Phase 4 seller tools exist.
 * Every record is labelled "[DEV SAMPLE]" and uses a reserved .invalid email. Refuses to run in production.
 *   npm run seed:dev -w apps/api            create
 *   npm run seed:dev -w apps/api -- --remove  delete
 */
import 'dotenv/config';
import { Client } from 'pg';

const EMAIL = 'dev-sample-seller@example.invalid';
const SHOP_SLUG = 'dev-sample-shop';

const ITEMS = [
  { slug: 'dev-sample-scientific-calculator', title: '[DEV SAMPLE] Scientific calculator', cat: 'electronics', kobo: 850000, cond: 'used_good', loc: 'Hostel A', desc: 'Sample listing for development. Works well, includes cover.' },
  { slug: 'dev-sample-engineering-maths-textbook', title: '[DEV SAMPLE] Engineering Mathematics textbook', cat: 'books-study-materials', kobo: 1200000, cond: 'used_fair', loc: 'Library', desc: 'Sample listing for development. Some highlighting inside.' },
  { slug: 'dev-sample-jollof-rice-pack', title: '[DEV SAMPLE] Jollof rice pack', cat: 'food-drinks', kobo: 150000, cond: null, loc: 'Cafeteria', desc: 'Sample listing for development. Freshly cooked daily.' },
  { slug: 'dev-sample-poster-design-service', title: '[DEV SAMPLE] Poster design service', cat: 'student-services', kobo: 300000, cond: null, loc: 'Online', desc: 'Sample listing for development. Turnaround two days.', type: 'service' },
  { slug: 'dev-sample-study-lamp', title: '[DEV SAMPLE] Rechargeable study lamp', cat: 'hostel-room-essentials', kobo: 450000, cond: 'new', loc: 'Hostel B', desc: 'Sample listing for development.' },
  { slug: 'dev-sample-sold-phone', title: '[DEV SAMPLE] Sold phone (shows sold state)', cat: 'electronics', kobo: 4500000, cond: 'used_good', loc: 'Main Gate', desc: 'Sample listing for development.', availability: 'sold' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed sample data in production.'); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('BEGIN');
    // Deleting the user cascades to the seller profile and all sample products.
    await c.query('DELETE FROM users WHERE email = $1', [EMAIL]);
    if (process.argv.includes('--remove')) { await c.query('COMMIT'); console.log('Removed development sample data.'); return; }
    const u = await c.query<{ id: string }>(`INSERT INTO users (email, password_hash, status) VALUES ($1, '!', 'suspended') RETURNING id`, [EMAIL]); // cannot sign in
    const s = await c.query<{ id: string }>(
      `INSERT INTO seller_profiles (user_id, slug, shop_name, description, public_location, status, approved_at)
       VALUES ($1, $2, '[DEV SAMPLE] Campus Shop', 'Development sample storefront. Not a real seller.', 'Hostel A', 'approved', now()) RETURNING id`, [u.rows[0]!.id, SHOP_SLUG]);
    for (const [i, it] of ITEMS.entries()) {
      await c.query(
        `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, product_type, condition, availability, status, campus_location, published_at)
         VALUES ($1, (SELECT id FROM categories WHERE slug = $2), $3, $4, $5, $6, $7, $8, $9, 'published', $10, now() - make_interval(hours => $11))`,
        [s.rows[0]!.id, it.cat, it.slug, it.title, it.desc, it.kobo, 'type' in it ? it.type : 'product', it.cond, 'availability' in it ? it.availability : 'available', it.loc, i + 1]);
    }
    await c.query('COMMIT');
    console.log(`Created ${ITEMS.length} [DEV SAMPLE] listings. Remove with: npm run seed:dev -w apps/api -- --remove`);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { await c.end(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
