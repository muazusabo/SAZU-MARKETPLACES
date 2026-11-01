import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PRODUCT_FROM_SQL, VISIBLE_PRODUCT_SQL } from '../products/visibility';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';

type ItemState = 'available' | 'reserved' | 'sold' | 'unavailable' | 'removed';

@Injectable()
export class WishlistService {
  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService, private readonly storage: StorageService) {}

  /** Saved product ids for the signed-in user only (used to draw the heart state). */
  async ids(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ product_id: string }>('SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000', [userId]);
    return rows.map((r) => r.product_id);
  }

  /** Only publicly visible listings can be saved. Saving twice is harmless (idempotent). */
  async add(userId: string, productId: string): Promise<void> {
    const visible = await this.db.query(`SELECT 1 ${PRODUCT_FROM_SQL} WHERE p.id = $1 AND ${VISIBLE_PRODUCT_SQL}`, [productId]);
    if (!visible.rowCount) throw new NotFoundException('This listing is not available to save.');
    const cap = await this.settings.get('max_wishlist_items');
    const r = await this.db.query(
      `INSERT INTO wishlist_items (user_id, product_id)
       SELECT $1, $2 WHERE (SELECT count(*) FROM wishlist_items WHERE user_id = $1) < $3
       ON CONFLICT DO NOTHING`, [userId, productId, cap]);
    if (!r.rowCount) {
      const exists = await this.db.query('SELECT 1 FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
      if (!exists.rowCount) throw new ConflictException(`You can save up to ${cap} items. Remove some to save more.`);
    }
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
  }

  /** Includes items that are no longer available, flagged with a state, so people can see why and remove them. */
  async list(userId: string, page: number, pageSize: number) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.price_kobo, p.availability, w.created_at AS saved_at,
              COALESCE(img.thumb_path, img.storage_path) AS image_path, s.shop_name, pc.name AS category_name,
              (p.status = 'published' AND s.status IN ('approved', 'pending') AND pc.is_active AND (ppc.id IS NULL OR ppc.is_active)
               AND (p.expires_at IS NULL OR p.expires_at > now())) AS visible,
              count(*) OVER() AS total
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
       JOIN seller_profiles s ON s.id = p.seller_id
       JOIN categories pc ON pc.id = p.category_id
       LEFT JOIN categories ppc ON ppc.id = pc.parent_id
       LEFT JOIN LATERAL (SELECT storage_path, thumb_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) img ON true
       WHERE w.user_id = $1 ORDER BY w.created_at DESC, p.id LIMIT $2 OFFSET $3`, [userId, pageSize, (page - 1) * pageSize]);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => {
        const state: ItemState = r.visible ? (r.availability as ItemState) : 'removed';
        return {
          id: r.id, slug: r.slug, title: r.title, priceKobo: Number(r.price_kobo), category: r.category_name, sellerName: r.shop_name,
          imageUrl: this.storage.publicUrl(r.image_path as string | null), savedAt: r.saved_at, state,
          // A link is only offered while the page still exists publicly.
          href: r.visible ? `/product/${r.slug}` : null,
        };
      }),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
