import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../auth/auth.constants';
import { StorageService } from '../storage/storage.service';
import { ListProductsQuery } from './dto/list-products.dto';
import { ProductReviewDto } from './dto/product-review.dto';
import { PRODUCT_FROM_SQL, VISIBLE_PRODUCT_SQL } from './visibility';

const FROM_SQL = PRODUCT_FROM_SQL;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

@Injectable()
export class ProductsService {
  private readonly secret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async list(q: ListProductsQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 12;
    const params: unknown[] = [];
    const where: string[] = [VISIBLE_PRODUCT_SQL];
    const bind = (v: unknown) => { params.push(v); return `$${params.length}`; };

    let rankSql = '0';
    if (q.q) {
      const ts = bind(q.q);
      const like = bind(`%${escapeLike(q.q)}%`);
      where.push(`(p.search_vector @@ websearch_to_tsquery('english', ${ts}) OR p.title ILIKE ${like} ESCAPE '\\')`);
      rankSql = `(ts_rank_cd(p.search_vector, websearch_to_tsquery('english', ${ts})) + CASE WHEN p.title ILIKE ${like} ESCAPE '\\' THEN 0.5 ELSE 0 END)`;
    }
    if (q.category) {
      const c = bind(q.category);
      where.push(`p.category_id IN (SELECT id FROM categories WHERE slug = ${c} OR parent_id = (SELECT id FROM categories WHERE slug = ${c}))`);
    }
    if (q.seller) where.push(`s.slug = ${bind(q.seller)}`);
    if (q.excludeSeller) where.push(`s.slug <> ${bind(q.excludeSeller)}`);
    if (q.exclude) where.push(`p.slug <> ${bind(q.exclude)}`);
    if (q.minPriceKobo !== undefined) where.push(`p.price_kobo >= ${bind(q.minPriceKobo)}`);
    if (q.maxPriceKobo !== undefined) where.push(`p.price_kobo <= ${bind(q.maxPriceKobo)}`);
    if (q.condition) where.push(`p.condition = ${bind(q.condition)}`);
    if (q.type) where.push(`p.product_type = ${bind(q.type)}`);
    if (q.location) where.push(`p.campus_location ILIKE ${bind(`%${escapeLike(q.location)}%`)} ESCAPE '\\'`);
    where.push(q.availability ? `p.availability = ${bind(q.availability)}` : `p.availability IN ('available', 'reserved')`);

    const popular = q.sort === 'popular';
    if (popular) where.push('COALESCE(v.n, 0) > 0');
    const order = {
      newest: 'p.published_at DESC, p.id DESC',
      price_asc: 'p.price_kobo ASC, p.published_at DESC, p.id DESC',
      price_desc: 'p.price_kobo DESC, p.published_at DESC, p.id DESC',
      relevance: `${rankSql} DESC, p.published_at DESC, p.id DESC`,
      popular: 'COALESCE(v.n, 0) DESC, p.published_at DESC, p.id DESC',
    }[q.sort ?? (q.q ? 'relevance' : 'newest')];

    const limit = bind(pageSize);
    const offset = bind((page - 1) * pageSize);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.price_kobo, p.product_type, p.condition, p.availability, p.status,
              p.campus_location, p.published_at,
              pc.slug AS category_slug, pc.name AS category_name,
              s.slug AS seller_slug, s.shop_name, (s.verified_at IS NOT NULL) AS seller_verified,
              COALESCE(img.thumb_path, img.storage_path) AS image_path, img.storage_path AS image_fallback_path, img.alt_text AS image_alt,
              COALESCE(review_summary.review_count, 0)::int AS review_count,
              COALESCE(review_summary.average_rating, 0)::float AS average_rating,
              count(*) OVER() AS total
       ${FROM_SQL}
       ${popular ? `LEFT JOIN (SELECT product_id, count(*) AS n FROM product_views WHERE viewed_at > now() - interval '30 days' GROUP BY product_id) v ON v.product_id = p.id` : ''}
       LEFT JOIN LATERAL (SELECT storage_path, thumb_path, alt_text FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) img ON true
       LEFT JOIN LATERAL (SELECT count(*) AS review_count, avg(rating)::float AS average_rating
                          FROM product_reviews WHERE product_id = p.id) review_summary ON true
       WHERE ${where.join(' AND ')}
       ORDER BY ${order}
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => this.card(r)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  private card(r: Record<string, unknown>) {
    return {
      id: r.id, slug: r.slug, title: r.title, priceKobo: Number(r.price_kobo), productType: r.product_type,
      condition: r.condition, availability: r.availability, status: r.status,
      campusLocation: r.campus_location, publishedAt: r.published_at,
      category: { slug: r.category_slug, name: r.category_name },
      seller: { slug: r.seller_slug, shopName: r.shop_name, verified: r.seller_verified },
      image: r.image_path ? {
        url: this.storage.publicUrl(r.image_path as string)!,
        fallbackUrl: r.image_fallback_path ? this.storage.publicUrl(r.image_fallback_path as string) : null,
        alt: (r.image_alt as string) || r.title,
      } : null,
      reviewCount: Number(r.review_count ?? 0), averageRating: Number(r.average_rating ?? 0),
    };
  }

  /** Full public detail. Only fields safe for anonymous visitors are selected: never email, phone, or user ids. */
  async bySlug(slug: string) {
    const detail = await this.detailWhere(`p.slug = $1 AND ${VISIBLE_PRODUCT_SQL}`, [slug]);
    if (!detail) throw new NotFoundException('This listing is not available. It may have been removed or is no longer published.');
    return detail;
  }

  /** Builds the public detail shape for whichever single product `where` selects (null if none). */
  async detailWhere(where: string, params: unknown[]) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.description, p.price_kobo, p.product_type, p.condition, p.availability,
              p.campus_location, p.collection_info, p.published_at, p.updated_at,
              pc.id AS category_id, pc.slug AS category_slug, pc.name AS category_name,
              ppc.slug AS parent_slug, ppc.name AS parent_name,
              s.id AS seller_id, s.slug AS seller_slug, s.shop_name, s.description AS seller_description, s.public_location AS seller_location,
              s.avatar_path AS seller_avatar, (s.verified_at IS NOT NULL) AS seller_verified,
              s.approved_at AS seller_approved_at,
              CASE
                WHEN seller_user.last_login_at >= now() - interval '24 hours' THEN 'today'
                WHEN seller_user.last_login_at >= now() - interval '7 days' THEN 'recently'
                ELSE NULL
              END AS seller_activity
       ${FROM_SQL}
       LEFT JOIN users seller_user ON seller_user.id = s.user_id
       WHERE ${where}`,
      params,
    );
    const p = rows[0];
    if (!p) return null;

    const [images, attrs, views, reviews, reviewSummary] = await Promise.all([
      this.db.query<{ storage_path: string; thumb_path: string | null; alt_text: string | null }>(
        'SELECT storage_path, thumb_path, alt_text FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at', [p.id]),
      this.db.query<{ label: string; value: string; input_type: string }>(
        `SELECT a.label, v.value, a.input_type FROM product_attribute_values v
         JOIN category_attributes a ON a.id = v.attribute_id WHERE v.product_id = $1 ORDER BY a.sort_order`, [p.id]),
      this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM product_views WHERE product_id = $1', [p.id]),
      this.db.query<{ id: string; rating: number; body: string; created_at: Date; display_name: string }>(
        `SELECT r.id, r.rating, r.body, r.created_at, pr.display_name
         FROM product_reviews r JOIN profiles pr ON pr.user_id = r.user_id
         WHERE r.product_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 50`, [p.id]),
      this.db.query<{ count: number; average: number | null }>(
        'SELECT count(*)::int AS count, avg(rating)::float AS average FROM product_reviews WHERE product_id = $1', [p.id]),
    ]);

    const canContact = p.availability === 'available' || p.availability === 'reserved';
    const reasons: Record<string, string> = {
      sold: 'This item has been sold.',
      unavailable: 'The seller has marked this listing as unavailable.',
    };
    return {
      id: p.id, slug: p.slug, title: p.title, description: p.description, priceKobo: Number(p.price_kobo),
      productType: p.product_type, condition: p.condition, availability: p.availability,
      campusLocation: p.campus_location, collectionInfo: p.collection_info,
      publishedAt: p.published_at, updatedAt: p.updated_at, viewCount: views.rows[0]?.n ?? 0,
      reviews: {
        count: reviewSummary.rows[0]?.count ?? 0,
        averageRating: reviewSummary.rows[0]?.average ?? 0,
        items: reviews.rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at, author: r.display_name })),
      },
      category: { slug: p.category_slug, name: p.category_name },
      parentCategory: p.parent_slug ? { slug: p.parent_slug, name: p.parent_name } : null,
      images: images.rows.map((i) => ({
        url: this.storage.publicUrl(i.storage_path), thumbUrl: this.storage.publicUrl(i.thumb_path ?? i.storage_path),
        alt: i.alt_text || (p.title as string),
      })),
      specifications: attrs.rows.map((a) => ({ label: a.label, value: a.value, type: a.input_type })),
      seller: {
        id: p.seller_id, slug: p.seller_slug, shopName: p.shop_name, description: p.seller_description,
        location: p.seller_location, verified: p.seller_verified,
        avatarUrl: this.storage.publicUrl(p.seller_avatar as string | null),
        activeSince: p.seller_approved_at,
        activityStatus: p.seller_activity,
      },
      canContact: { allowed: canContact, reason: canContact ? null : (reasons[p.availability as string] ?? null) },
    };
  }

  async createReview(slug: string, user: AuthUser, dto: ProductReviewDto) {
    const { rows } = await this.db.query<{ id: string; seller_user_id: string }>(
      `SELECT p.id, s.user_id AS seller_user_id ${FROM_SQL}
       WHERE p.slug = $1 AND ${VISIBLE_PRODUCT_SQL}`,
      [slug],
    );
    const product = rows[0];
    if (!product) throw new NotFoundException('This listing is not available for review.');
    if (product.seller_user_id === user.id) throw new ForbiddenException('You cannot review your own listing.');

    try {
      const { rows: inserted } = await this.db.query<{ id: string; rating: number; body: string; created_at: Date; author: string }>(
        `WITH created AS (
           INSERT INTO product_reviews (product_id, user_id, rating, body)
           VALUES ($1, $2, $3, $4)
           RETURNING id, rating, body, created_at, user_id
         )
         SELECT created.id, created.rating, created.body, created.created_at, profiles.display_name AS author
         FROM created JOIN profiles ON profiles.user_id = created.user_id`,
        [product.id, user.id, dto.rating, dto.body],
      );
      const review = inserted[0]!;
      return { id: review.id, rating: review.rating, body: review.body, createdAt: review.created_at, author: review.author };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('You have already reviewed this listing.');
      }
      throw error;
    }
  }

  /** At most one recorded view per viewer per product per hour. The hash rotates daily and is not reversible. */
  async recordView(slug: string, ip: string, userAgent: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const viewer = createHash('sha256').update(`${this.secret}|${day}|${ip}|${userAgent}`).digest('hex');
    await this.db.query(
      `INSERT INTO product_views (product_id, viewer_hash)
       SELECT p.id, $2::text ${FROM_SQL}
       WHERE p.slug = $1 AND ${VISIBLE_PRODUCT_SQL}
         AND NOT EXISTS (SELECT 1 FROM product_views v WHERE v.product_id = p.id AND v.viewer_hash = $2 AND v.viewed_at > now() - interval '1 hour')`,
      [slug, viewer],
    );
  }

  async sitemap() {
    const [products, sellers] = await Promise.all([
      this.db.query<{ slug: string; updated_at: Date }>(
        `SELECT p.slug, p.updated_at ${FROM_SQL} WHERE ${VISIBLE_PRODUCT_SQL} ORDER BY p.published_at DESC LIMIT 5000`),
      this.db.query<{ slug: string; updated_at: Date }>(
        `SELECT s.slug, s.updated_at FROM seller_profiles s
         WHERE s.status = 'approved' OR (
           s.status = 'pending' AND EXISTS (
             SELECT 1 FROM products p
             JOIN categories pc ON pc.id = p.category_id
             LEFT JOIN categories ppc ON ppc.id = pc.parent_id
             WHERE p.seller_id = s.id AND ${VISIBLE_PRODUCT_SQL}
           )
         )
         ORDER BY s.updated_at DESC LIMIT 5000`),
    ]);
    return {
      products: products.rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at })),
      sellers: sellers.rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at })),
    };
  }
}
