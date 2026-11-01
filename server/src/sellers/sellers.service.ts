import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { VISIBLE_PRODUCT_SQL } from '../products/visibility';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SellersService {
  constructor(private readonly db: DatabaseService, private readonly storage: StorageService) {}

  /** Approved sellers, or pending sellers with at least one publicly visible listing, have public storefronts. */
  async storefront(slug: string) {
    const { rows } = await this.db.query<{
      id: string; slug: string; shop_name: string; description: string | null; public_location: string | null;
      avatar_path: string | null; verified: boolean; approved_at: Date | null;
      activity_status: 'today' | 'recently' | null;
    }>(
      `SELECT s.id, s.slug, s.shop_name, s.description, s.public_location, s.avatar_path,
              (s.verified_at IS NOT NULL) AS verified, s.approved_at,
              CASE
                WHEN u.last_login_at >= now() - interval '24 hours' THEN 'today'
                WHEN u.last_login_at >= now() - interval '7 days' THEN 'recently'
                ELSE NULL
              END AS activity_status
       FROM seller_profiles s JOIN users u ON u.id = s.user_id
       WHERE s.slug = $1 AND (
         s.status = 'approved' OR (
           s.status = 'pending' AND EXISTS (
             SELECT 1 FROM products p
             JOIN categories pc ON pc.id = p.category_id
             LEFT JOIN categories ppc ON ppc.id = pc.parent_id
             WHERE p.seller_id = s.id AND ${VISIBLE_PRODUCT_SQL}
           )
         )
       )`,
      [slug],
    );
    const s = rows[0];
    if (!s) throw new NotFoundException('Storefront not found.');
    const [count, cats] = await Promise.all([
      this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM products p JOIN seller_profiles s ON s.id = p.seller_id
         JOIN categories pc ON pc.id = p.category_id LEFT JOIN categories ppc ON ppc.id = pc.parent_id
         WHERE p.seller_id = $1 AND p.availability IN ('available','reserved') AND ${VISIBLE_PRODUCT_SQL}`, [s.id]),
      this.db.query<{ slug: string; name: string }>(
        `SELECT DISTINCT COALESCE(ppc.slug, pc.slug) AS slug, COALESCE(ppc.name, pc.name) AS name
         FROM products p JOIN seller_profiles s ON s.id = p.seller_id
         JOIN categories pc ON pc.id = p.category_id LEFT JOIN categories ppc ON ppc.id = pc.parent_id
         WHERE p.seller_id = $1 AND ${VISIBLE_PRODUCT_SQL} ORDER BY 2`, [s.id]),
    ]);
    return {
      id: s.id, slug: s.slug, shopName: s.shop_name, description: s.description, location: s.public_location,
      avatarUrl: this.storage.publicUrl(s.avatar_path), verified: s.verified, memberSince: s.approved_at,
      activityStatus: s.activity_status,
      activeProductCount: count.rows[0]?.n ?? 0, categories: cats.rows,
    };
  }
}
