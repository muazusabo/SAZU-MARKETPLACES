import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { slugify, uniqueSlug } from '../common/slug';
import { assertUpload } from '../common/upload';
import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { ImageService } from '../storage/image.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto, ListOwnProductsQuery, UpdateProductDto } from './dto/seller-products.dto';
import { ProductsService } from './products.service';

interface AttrDef { id: string; key: string; label: string; input_type: string; options: string[] | null; is_required: boolean }
interface OwnRow {
  id: string; slug: string; title: string; description: string; category_id: string; product_type: string;
  status: string; availability: string; published_at: Date | null;
}

const SELLER_BLOCKED: Record<string, string> = {
  draft: 'Submit your seller application before listing products.',
  rejected: 'Your seller application was not approved. Update it and resubmit from your dashboard.',
  suspended: 'Your seller account is suspended.',
};

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly products: ProductsService,
  ) {}

  // ---------- guards ----------
  private async requireSeller(userId: string): Promise<{ id: string }> {
    const { rows } = await this.db.query<{ id: string; status: string }>('SELECT id, status FROM seller_profiles WHERE user_id = $1', [userId]);
    const s = rows[0];
    if (!s) throw new ForbiddenException('Apply to become a seller first.');
    if (!['approved', 'pending'].includes(s.status)) throw new ForbiddenException(SELLER_BLOCKED[s.status] ?? 'Your seller account cannot list products.');
    return { id: s.id };
  }

  /** Ownership is part of the query itself. Someone else's product is indistinguishable from a missing one (404). */
  private async own(sellerId: string, productId: string, c?: PoolClient): Promise<OwnRow> {
    const run = c ? c.query.bind(c) : this.db.query.bind(this.db);
    const { rows } = await (run as DatabaseService['query'])<OwnRow>(
      `SELECT id, slug, title, description, category_id, product_type, status, availability, published_at
       FROM products WHERE id = $1 AND seller_id = $2`, [productId, sellerId]);
    if (!rows[0]) throw new NotFoundException('Listing not found.');
    return rows[0];
  }

  private assertEditable(p: OwnRow) {
    if (p.status === 'archived') throw new ConflictException('Restore this listing before editing it.');
    if (p.status === 'removed') throw new ConflictException('This listing was removed by a moderator and cannot be changed.');
  }

  // ---------- categories and attributes ----------
  private async categoryId(slug: string): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT c.id FROM categories c LEFT JOIN categories par ON par.id = c.parent_id
       WHERE c.slug = $1 AND c.is_active AND (par.id IS NULL OR par.is_active)`, [slug]);
    if (!rows[0]) throw new BadRequestException('That category is not available.');
    return rows[0].id;
  }

  private async attrDefs(categoryId: string): Promise<AttrDef[]> {
    const { rows } = await this.db.query<AttrDef>(
      `SELECT id, key, label, input_type, options, is_required FROM category_attributes
       WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1) ORDER BY sort_order`, [categoryId]);
    return rows;
  }

  /** Validates seller-supplied category fields against the category's definitions. Returns attrId -> value. */
  private validateAttributes(defs: AttrDef[], input: Record<string, unknown> | undefined): Map<string, string> {
    const out = new Map<string, string>();
    if (!input) return out;
    const keys = Object.keys(input);
    if (keys.length > 20) throw new BadRequestException('Too many specification fields.');
    for (const key of keys) {
      const def = defs.find((d) => d.key === key);
      if (!def) throw new BadRequestException(`"${key}" is not a field for this category.`);
      const raw = input[key];
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') throw new BadRequestException(`${def.label} must be text.`);
      const v = String(raw).trim();
      if (!v) continue;
      if (v.length > 500) throw new BadRequestException(`${def.label} is too long (max 500 characters).`);
      if (def.input_type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) throw new BadRequestException(`${def.label} must be a number.`);
      if (def.input_type === 'boolean' && !['true', 'false'].includes(v)) throw new BadRequestException(`${def.label} must be yes or no.`);
      if (def.input_type === 'select' && !(def.options ?? []).includes(v)) throw new BadRequestException(`${def.label} must be one of: ${(def.options ?? []).join(', ')}.`);
      if (def.input_type === 'url') {
        try { if (!['http:', 'https:'].includes(new URL(v).protocol)) throw new Error(); } catch { throw new BadRequestException(`${def.label} must be a valid web link starting with http:// or https://.`); }
      }
      out.set(def.id, v);
    }
    return out;
  }

  private async writeAttributes(c: PoolClient, productId: string, values: Map<string, string>) {
    await c.query('DELETE FROM product_attribute_values WHERE product_id = $1', [productId]);
    for (const [attributeId, value] of values) {
      await c.query('INSERT INTO product_attribute_values (product_id, attribute_id, value) VALUES ($1, $2, $3)', [productId, attributeId, value]);
    }
  }

  private async currentAttributes(productId: string): Promise<Map<string, string>> {
    const { rows } = await this.db.query<{ attribute_id: string; value: string }>('SELECT attribute_id, value FROM product_attribute_values WHERE product_id = $1', [productId]);
    return new Map(rows.map((r) => [r.attribute_id, r.value]));
  }

  // ---------- create / update ----------
  async create(userId: string, dto: CreateProductDto) {
    const seller = await this.requireSeller(userId);
    const categoryId = await this.categoryId(dto.categorySlug);
    const attrs = this.validateAttributes(await this.attrDefs(categoryId), dto.attributes);
    const type = dto.productType ?? 'product';
    const exists = async (s: string) => (await this.db.query('SELECT 1 FROM products WHERE slug = $1', [s])).rowCount! > 0;
    for (let attempt = 0; ; attempt++) {
      const slug = await uniqueSlug(slugify(dto.title, 80), exists);
      try {
        const id = await this.db.transaction(async (c) => {
          const r = await c.query<{ id: string }>(
            `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, product_type, condition, campus_location, collection_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [seller.id, categoryId, slug, dto.title, dto.description, dto.priceKobo, type, type === 'service' ? null : dto.condition ?? null, dto.campusLocation ?? null, dto.collectionInfo ?? null]);
          await this.writeAttributes(c, r.rows[0]!.id, attrs);
          return r.rows[0]!.id;
        });
        return this.get(userId, id);
      } catch (e) {
        if ((e as { code?: string }).code === '23505' && attempt < 3) continue; // slug race
        throw e;
      }
    }
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    this.assertEditable(p);

    let categoryId = p.category_id;
    if (dto.categorySlug) categoryId = await this.categoryId(dto.categorySlug);
    const defs = await this.attrDefs(categoryId);
    let attrs: Map<string, string> | undefined;
    if (dto.attributes) {
      attrs = this.validateAttributes(defs, dto.attributes);
    } else if (categoryId !== p.category_id) {
      const keep = new Set(defs.map((d) => d.id)); // drop values that don't exist in the new category
      attrs = new Map([...(await this.currentAttributes(p.id))].filter(([k]) => keep.has(k)));
    }

    const sets: string[] = []; const vals: unknown[] = [p.id];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); }; // col names are literals below
    if (dto.title !== undefined) add('title', dto.title);
    if (dto.description !== undefined) add('description', dto.description);
    if (categoryId !== p.category_id) add('category_id', categoryId);
    if (dto.priceKobo !== undefined) add('price_kobo', dto.priceKobo);
    if (dto.productType !== undefined) add('product_type', dto.productType);
    if (dto.condition !== undefined) add('condition', dto.condition);
    if (dto.campusLocation !== undefined) add('campus_location', dto.campusLocation === '' ? null : dto.campusLocation);
    if (dto.collectionInfo !== undefined) add('collection_info', dto.collectionInfo === '' ? null : dto.collectionInfo);
    if (dto.productType === 'service' && dto.condition === undefined) add('condition', null); // services have no condition
    await this.db.transaction(async (c) => {
      if (sets.length) await c.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $1`, vals);
      if (attrs) await this.writeAttributes(c, p.id, attrs);
    });
    return this.get(userId, p.id);
  }

  // ---------- lifecycle ----------
  async submit(userId: string, productId: string) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    if (p.status !== 'draft' && p.status !== 'rejected') throw new ConflictException(`A listing with status "${p.status}" cannot be submitted.`);

    const problems: string[] = [];
    if (await this.settings.get('require_listing_image')) {
      const n = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM product_images WHERE product_id = $1', [p.id]);
      if (n.rows[0]!.n < 1) problems.push('Add at least one photo.');
    }
    const defs = await this.attrDefs(p.category_id);
    const have = await this.currentAttributes(p.id);
    for (const d of defs.filter((x) => x.is_required && !have.has(x.id))) problems.push(`Fill in "${d.label}".`);
    if (problems.length) throw new BadRequestException({ message: problems, error: 'Listing incomplete' });

    const cap = await this.settings.get('max_active_listings_per_seller');
    const active = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM products WHERE seller_id = $1 AND status IN ('pending_review', 'published')`, [seller.id]);
    if (active.rows[0]!.n >= cap) throw new ConflictException(`You can have at most ${cap} active listings. Archive or sell some first.`);

    const days = await this.settings.get('listing_expiry_days');
    await this.db.query(
      `UPDATE products SET status = 'published', rejection_reason = NULL, published_at = COALESCE(published_at, now()),
         expires_at = CASE WHEN $2::int > 0 THEN now() + make_interval(days => $2::int) ELSE NULL END WHERE id = $1`, [p.id, days]);
    return this.get(userId, p.id);
  }

  async setAvailability(userId: string, productId: string, availability: 'available' | 'reserved' | 'sold' | 'unavailable') {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    if (p.status !== 'published') throw new ConflictException('Only published listings can change availability.');
    await this.db.query('UPDATE products SET availability = $2 WHERE id = $1', [p.id, availability]);
    return this.get(userId, p.id);
  }

  async archive(userId: string, productId: string) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    if (p.status === 'archived') return this.get(userId, p.id);
    if (p.status === 'removed') throw new ConflictException('This listing was removed by a moderator.');
    await this.db.query(`UPDATE products SET status = 'archived', archived_at = now() WHERE id = $1`, [p.id]);
    return this.get(userId, p.id);
  }

  /** Restored listings return as drafts and must be submitted again (so moderation applies). */
  async restore(userId: string, productId: string) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    if (p.status !== 'archived') throw new ConflictException('Only archived listings can be restored.');
    await this.db.query(`UPDATE products SET status = 'draft', archived_at = NULL, availability = 'available' WHERE id = $1`, [p.id]);
    return this.get(userId, p.id);
  }

  /** Listings that were ever public are kept (moderation history, reports); sellers archive those instead. */
  async remove(userId: string, productId: string): Promise<void> {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    if (p.published_at || !['draft', 'rejected', 'archived'].includes(p.status)) {
      throw new ConflictException('Listings that have been published or are under review cannot be deleted. Archive it instead.');
    }
    const imgs = await this.db.query<{ storage_path: string; thumb_path: string | null }>('SELECT storage_path, thumb_path FROM product_images WHERE product_id = $1', [p.id]);
    await this.db.query('DELETE FROM products WHERE id = $1', [p.id]);
    await this.storage.deletePublic(...imgs.rows.flatMap((i) => [i.storage_path, i.thumb_path]));
  }

  // ---------- reads ----------
  async get(userId: string, productId: string) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    const detail = await this.products.detailWhere('p.id = $1 AND p.seller_id = $2', [p.id, seller.id]);
    const [imgs, vals, extra] = await Promise.all([
      this.db.query<{ id: string; storage_path: string; thumb_path: string | null; alt_text: string | null; sort_order: number; width: number | null; height: number | null }>(
        'SELECT id, storage_path, thumb_path, alt_text, sort_order, width, height FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at', [p.id]),
      this.db.query<{ key: string; value: string }>(
        `SELECT a.key, v.value FROM product_attribute_values v JOIN category_attributes a ON a.id = v.attribute_id WHERE v.product_id = $1`, [p.id]),
      this.db.query<{ status: string; rejection_reason: string | null; expires_at: Date | null }>('SELECT status, rejection_reason, expires_at FROM products WHERE id = $1', [p.id]),
    ]);
    return {
      ...detail!,
      id: p.id, status: extra.rows[0]!.status, rejectionReason: extra.rows[0]!.rejection_reason, expiresAt: extra.rows[0]!.expires_at,
      attributeValues: Object.fromEntries(vals.rows.map((r) => [r.key, r.value])),
      images: imgs.rows.map((i) => ({
        id: i.id, url: this.storage.publicUrl(i.storage_path), thumbUrl: this.storage.publicUrl(i.thumb_path ?? i.storage_path),
        alt: i.alt_text ?? '', sortOrder: i.sort_order, width: i.width, height: i.height,
      })),
    };
  }

  async list(userId: string, q: ListOwnProductsQuery) {
    const seller = await this.requireSeller(userId);
    const page = q.page ?? 1; const pageSize = q.pageSize ?? 20;
    const filter = {
      all: 'TRUE', draft: `p.status = 'draft'`, pending_review: `p.status = 'pending_review'`, rejected: `p.status = 'rejected'`, archived: `p.status = 'archived'`,
      active: `p.status = 'published' AND p.availability IN ('available', 'reserved')`,
      sold: `p.status = 'published' AND p.availability = 'sold'`, unavailable: `p.status = 'published' AND p.availability = 'unavailable'`,
    }[q.status ?? 'all'];
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.price_kobo, p.status, p.availability, p.product_type, p.rejection_reason, p.published_at, p.updated_at,
              c.name AS category_name, COALESCE(img.thumb_path, img.storage_path) AS image_path,
              (SELECT count(*)::int FROM product_views v WHERE v.product_id = p.id AND v.viewed_at > now() - interval '30 days') AS views_30d,
              (SELECT count(*)::int FROM wishlist_items w WHERE w.product_id = p.id) AS saves,
              count(*) OVER() AS total
       FROM products p JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (SELECT storage_path, thumb_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) img ON true
       WHERE p.seller_id = $1 AND ${filter}
       ORDER BY p.updated_at DESC, p.id LIMIT $2 OFFSET $3`, [seller.id, pageSize, (page - 1) * pageSize]);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => ({
        id: r.id, slug: r.slug, title: r.title, priceKobo: Number(r.price_kobo), status: r.status, availability: r.availability,
        productType: r.product_type, rejectionReason: r.rejection_reason, publishedAt: r.published_at, updatedAt: r.updated_at,
        category: r.category_name, imageUrl: this.storage.publicUrl(r.image_path as string | null), views30d: r.views_30d, saves: r.saves, // aggregate only: who saved it is never exposed
      })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /** Real counts only. Message and wishlist indicators arrive with those features. */
  async dashboard(userId: string) {
    const seller = await this.requireSeller(userId);
    const [counts, top, total] = await Promise.all([
      this.db.query<Record<string, number>>(
        `SELECT count(*) FILTER (WHERE status = 'published' AND availability IN ('available', 'reserved'))::int AS active,
                count(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
                count(*) FILTER (WHERE status = 'published' AND availability = 'sold')::int AS sold,
                count(*) FILTER (WHERE status = 'published' AND availability = 'unavailable')::int AS unavailable,
                count(*) FILTER (WHERE status = 'draft')::int AS draft,
                count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                count(*) FILTER (WHERE status = 'archived')::int AS archived
         FROM products WHERE seller_id = $1`, [seller.id]),
      this.db.query<{ id: string; slug: string; title: string; views: number }>(
        `SELECT p.id, p.slug, p.title, count(v.id)::int AS views FROM products p JOIN product_views v ON v.product_id = p.id
         WHERE p.seller_id = $1 AND v.viewed_at > now() - interval '30 days' GROUP BY p.id ORDER BY views DESC, p.title LIMIT 5`, [seller.id]),
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM product_views v JOIN products p ON p.id = v.product_id WHERE p.seller_id = $1 AND v.viewed_at > now() - interval '30 days'`, [seller.id]),
    ]);
    const c = counts.rows[0]!;
    const unread = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM messages m JOIN conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = $1
       WHERE m.sender_id <> $1 AND m.id > COALESCE(p.last_read_message_id, 0)`, [userId]);
    return {
      unreadMessages: unread.rows[0]!.n,
      counts: { active: c.active, pendingReview: c.pending_review, sold: c.sold, unavailable: c.unavailable, draft: c.draft, rejected: c.rejected, archived: c.archived },
      views30d: total.rows[0]!.n,
      topListings: top.rows,
    };
  }

  // ---------- images ----------
  async uploadImage(userId: string, productId: string, file: Express.Multer.File | undefined, altText?: string) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    this.assertEditable(p);
    const [globalMax, maxBytes, perDay, allowedTypes] = await Promise.all([
      this.settings.get('max_images_per_listing'), this.settings.get('max_image_bytes'), this.settings.get('max_uploads_per_user_per_day'), this.settings.get('allowed_image_types'),
    ]);
    const catMax = await this.db.query<{ max_images: number | null }>('SELECT max_images FROM categories WHERE id = $1', [p.category_id]);
    const maxImages = catMax.rows[0]?.max_images ?? globalMax; // a category can set its own photo limit
    const count = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM product_images WHERE product_id = $1', [p.id]);
    if (count.rows[0]!.n >= maxImages) throw new ConflictException(`A listing can have at most ${maxImages} photos.`);
    const today = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM product_images i JOIN products x ON x.id = i.product_id WHERE x.seller_id = $1 AND i.created_at > now() - interval '24 hours'`, [seller.id]);
    if (today.rows[0]!.n >= perDay) throw new ForbiddenException('You have reached today’s photo upload limit. Try again tomorrow.');

    const processed = await this.images.processListingImage(assertUpload(file, maxBytes), allowedTypes);
    const base = `products/${p.id}/${randomUUID()}`;
    const mainKey = `${base}.webp`; const thumbKey = `${base}-thumb.webp`; // names are server-generated: client file names are never used
    const storedMainKey = await this.storage.putPublic(mainKey, processed.main, 'image/webp');
    let storedThumbKey: string;
    try {
      storedThumbKey = await this.storage.putPublic(thumbKey, processed.thumb, 'image/webp');
    } catch (e) {
      await this.storage.deletePublic(storedMainKey);
      throw e;
    }
    try {
      const id = await this.db.transaction(async (c) => {
        const r = await c.query<{ id: string }>(
          `INSERT INTO product_images (product_id, storage_path, thumb_path, alt_text, sort_order, width, height, byte_size)
           VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_images WHERE product_id = $1), $5, $6, $7) RETURNING id`,
          [p.id, storedMainKey, storedThumbKey, altText || null, processed.width, processed.height, processed.main.length]);
        return r.rows[0]!.id;
      });
      return { id, url: this.storage.publicUrl(storedMainKey), thumbUrl: this.storage.publicUrl(storedThumbKey), alt: altText ?? '' };
    } catch (e) {
      await this.storage.deletePublic(storedMainKey, storedThumbKey); // don't leave orphan files behind
      throw e;
    }
  }

  async deleteImage(userId: string, productId: string, imageId: string): Promise<void> {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    this.assertEditable(p);
    const { rows } = await this.db.query<{ storage_path: string; thumb_path: string | null }>(
      'SELECT storage_path, thumb_path FROM product_images WHERE id = $1 AND product_id = $2', [imageId, p.id]);
    if (!rows[0]) throw new NotFoundException('Photo not found.');
    if (['published', 'pending_review'].includes(p.status) && (await this.settings.get('require_listing_image'))) {
      const n = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM product_images WHERE product_id = $1', [p.id]);
      if (n.rows[0]!.n <= 1) throw new ConflictException('A listing that is live or under review needs at least one photo. Add another before removing this one.');
    }
    await this.db.transaction(async (c) => {
      await c.query('DELETE FROM product_images WHERE id = $1', [imageId]);
    });
    await this.storage.deletePublic(rows[0].storage_path, rows[0].thumb_path);
  }

  async reorderImages(userId: string, productId: string, ids: string[]) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    this.assertEditable(p);
    const { rows } = await this.db.query<{ id: string }>('SELECT id FROM product_images WHERE product_id = $1', [p.id]);
    if (rows.length !== ids.length || !rows.every((r) => ids.includes(r.id))) throw new BadRequestException('Send every photo of this listing exactly once.');
    await this.db.transaction(async (c) => {
      for (const [i, id] of ids.entries()) await c.query('UPDATE product_images SET sort_order = $2 WHERE id = $1 AND product_id = $3', [id, i + 1, p.id]);
    });
    return (await this.get(userId, p.id)).images;
  }

  async updateImage(userId: string, productId: string, imageId: string, altText: string | null | undefined) {
    const seller = await this.requireSeller(userId);
    const p = await this.own(seller.id, productId);
    this.assertEditable(p);
    const r = await this.db.query('UPDATE product_images SET alt_text = $3 WHERE id = $1 AND product_id = $2', [imageId, p.id, altText || null]);
    if (!r.rowCount) throw new NotFoundException('Photo not found.');
    return (await this.get(userId, p.id)).images;
  }
}
