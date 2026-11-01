import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { slugify, uniqueSlug } from '../common/slug';
import { assertUpload } from '../common/upload';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { ImageService } from '../storage/image.service';
import { StorageService } from '../storage/storage.service';
import { SellerApplicationDto, UpdateSellerDto } from './dto/seller.dto';

const RESERVED_SLUGS = ['me', 'apply', 'new', 'mine', 'admin'];

type Decision = 'approve' | 'reject' | 'suspend' | 'reinstate';

@Injectable()
export class SellerAccountService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly notifications: NotificationsService,
  ) {}

  async getMine(userId: string) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT id, slug, shop_name, description, preferred_campus_area, public_location, contact_preferences, avatar_path,
              status, review_note, submitted_at, approved_at, (verified_at IS NOT NULL) AS verified
       FROM seller_profiles WHERE user_id = $1`, [userId]);
    const s = rows[0];
    if (!s) return null;
    const cats = await this.db.query<{ slug: string; name: string }>(
      `SELECT c.slug, c.name FROM seller_profile_categories sc JOIN categories c ON c.id = sc.category_id
       WHERE sc.seller_id = $1 ORDER BY c.sort_order`, [s.id]);
    return {
      id: s.id, slug: s.slug, shopName: s.shop_name, description: s.description,
      preferredCampusArea: s.preferred_campus_area, publicLocation: s.public_location, contactPreferences: s.contact_preferences,
      avatarUrl: this.storage.publicUrl(s.avatar_path as string | null), status: s.status, reviewNote: s.review_note,
      verified: s.verified, submittedAt: s.submitted_at, approvedAt: s.approved_at, categories: cats.rows,
    };
  }

  private async categoryIds(slugs: string[] | undefined, c?: PoolClient): Promise<string[]> {
    if (!slugs?.length) return [];
    const unique = [...new Set(slugs)];
    const q = (c ?? this.db).query.bind(c ?? this.db) as DatabaseService['query'];
    const { rows } = await q<{ id: string }>(`SELECT id FROM categories WHERE slug = ANY($1::citext[]) AND is_active`, [unique]);
    if (rows.length !== unique.length) throw new BadRequestException('One or more selected categories are not available.');
    return rows.map((r) => r.id);
  }

  private async replaceCategories(c: PoolClient, sellerId: string, ids: string[]) {
    await c.query('DELETE FROM seller_profile_categories WHERE seller_id = $1', [sellerId]);
    for (const id of ids) await c.query('INSERT INTO seller_profile_categories (seller_id, category_id) VALUES ($1, $2)', [sellerId, id]);
  }

  /** Moves a draft/rejected application forward: pending when approval is required, otherwise approved immediately. */
  private async finalize(c: PoolClient, sellerId: string, userId: string) {
    const approvalRequired = await this.settings.get('seller_approval_required');
    if (approvalRequired) {
      await c.query(`UPDATE seller_profiles SET status = 'pending', submitted_at = now(), review_note = NULL WHERE id = $1`, [sellerId]);
    } else {
      await c.query(`UPDATE seller_profiles SET status = 'approved', submitted_at = now(), approved_at = now(), review_note = NULL WHERE id = $1`, [sellerId]);
      await c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'seller') ON CONFLICT DO NOTHING`, [userId]);
    }
  }

  async apply(userId: string, dto: SellerApplicationDto) {
    if (await this.getMine(userId)) throw new ConflictException('You already have a seller application. Open your seller dashboard to continue.');
    const categoryIds = await this.categoryIds(dto.categorySlugs);
    if (!dto.saveAsDraft && categoryIds.length === 0) throw new BadRequestException('Choose at least one main selling category.');
    const exists = async (slug: string) => (await this.db.query('SELECT 1 FROM seller_profiles WHERE slug = $1', [slug])).rowCount! > 0;
    for (let attempt = 0; ; attempt++) {
      const slug = await uniqueSlug(slugify(dto.shopName), exists, RESERVED_SLUGS);
      try {
        await this.db.transaction(async (c) => {
          const r = await c.query<{ id: string }>(
            `INSERT INTO seller_profiles (user_id, slug, shop_name, description, preferred_campus_area, contact_preferences, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
            [userId, slug, dto.shopName, dto.description ?? null, dto.preferredCampusArea ?? null, dto.contactPreferences ?? null]);
          const id = r.rows[0]!.id;
          await this.replaceCategories(c, id, categoryIds);
          if (!dto.saveAsDraft) await this.finalize(c, id, userId);
        });
        break;
      } catch (e) {
        const err = e as { code?: string; constraint?: string };
        if (err.code === '23505' && err.constraint?.includes('slug') && attempt < 3) continue; // slug race: retry
        if (err.code === '23505') throw new ConflictException('You already have a seller application.');
        throw e;
      }
    }
    return this.getMine(userId);
  }

  async submit(userId: string) {
    const mine = await this.getMine(userId);
    if (!mine) throw new NotFoundException('You have not started a seller application.');
    if (mine.status !== 'draft' && mine.status !== 'rejected') throw new ConflictException(`An application with status "${mine.status}" cannot be submitted.`);
    if (mine.categories.length === 0) throw new BadRequestException('Choose at least one main selling category.');
    await this.db.transaction((c) => this.finalize(c, mine.id as string, userId));
    return this.getMine(userId);
  }

  async updateMine(userId: string, dto: UpdateSellerDto) {
    const mine = await this.getMine(userId);
    if (!mine) throw new NotFoundException('You have not started a seller application.');
    if (mine.status === 'suspended') throw new ForbiddenException('This seller account is suspended.');
    const categoryIds = dto.categorySlugs ? await this.categoryIds(dto.categorySlugs) : undefined;
    if (dto.categorySlugs && categoryIds!.length === 0) throw new BadRequestException('Choose at least one main selling category.');
    const map: Record<string, string> = {
      shopName: 'shop_name', description: 'description', preferredCampusArea: 'preferred_campus_area',
      publicLocation: 'public_location', contactPreferences: 'contact_preferences',
    };
    const sets: string[] = []; const vals: unknown[] = [mine.id];
    for (const [k, col] of Object.entries(map)) {
      const v = (dto as Record<string, unknown>)[k];
      if (v === undefined) continue;
      vals.push(v === '' ? null : v); sets.push(`${col} = $${vals.length}`); // column names are from the fixed map above
    }
    await this.db.transaction(async (c) => {
      if (sets.length) await c.query(`UPDATE seller_profiles SET ${sets.join(', ')} WHERE id = $1`, vals);
      if (categoryIds) await this.replaceCategories(c, mine.id as string, categoryIds);
    });
    return this.getMine(userId);
  }

  async setAvatar(userId: string, file: Express.Multer.File | undefined) {
    const mine = await this.getMine(userId);
    if (!mine) throw new NotFoundException('You have not started a seller application.');
    if (mine.status === 'suspended') throw new ForbiddenException('This seller account is suspended.');
    const buf = await this.images.processAvatar(assertUpload(file, await this.settings.get('max_image_bytes')), await this.settings.get('allowed_image_types'));
    const key = `avatars/shops/${mine.id}/${randomUUID()}.webp`;
    const storedKey = await this.storage.putPublic(key, buf, 'image/webp');
    const old = await this.db.query<{ avatar_path: string | null }>('SELECT avatar_path FROM seller_profiles WHERE id = $1', [mine.id]);
    await this.db.query('UPDATE seller_profiles SET avatar_path = $2 WHERE id = $1', [mine.id, storedKey]);
    await this.storage.deletePublic(old.rows[0]?.avatar_path);
    return this.getMine(userId);
  }

  /**
   * The single place sellers change review status. Used by the admin CLI now and by admin endpoints in Phase 7.
   * Suspending or rejecting hides every listing automatically because public visibility requires an approved seller.
   */
  async review(sellerId: string, decision: Decision, note?: string): Promise<{ status: string }> {
    const { rows } = await this.db.query<{ status: string; user_id: string }>('SELECT status, user_id FROM seller_profiles WHERE id = $1', [sellerId]);
    const s = rows[0];
    if (!s) throw new NotFoundException('Seller not found.');
    const allowed: Record<Decision, string[]> = { approve: ['pending'], reject: ['pending'], suspend: ['approved'], reinstate: ['suspended'] };
    if (!allowed[decision].includes(s.status)) throw new ConflictException(`Cannot ${decision} a seller whose status is "${s.status}".`);
    if ((decision === 'reject' || decision === 'suspend') && !note?.trim()) throw new BadRequestException('A reason is required so the seller can understand the decision.');
    const next = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reinstate: 'approved' }[decision];
    await this.db.transaction(async (c) => {
      await c.query(
        `UPDATE seller_profiles SET status = $2, review_note = $3,
           approved_at = CASE WHEN $2 = 'approved' THEN COALESCE(approved_at, now()) ELSE approved_at END WHERE id = $1`,
        [sellerId, next, note?.trim() || null]);
      if (next === 'approved') await c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'seller') ON CONFLICT DO NOTHING`, [s.user_id]);
      if (next === 'suspended' || next === 'rejected') await c.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'seller'`, [s.user_id]);
    });
    const msg = {
      approved: { type: 'seller_approved', title: decision === 'reinstate' ? 'Your seller account was reinstated' : 'Your seller application was approved', body: 'You can now list products and services.', link: '/dashboard' },
      rejected: { type: 'seller_rejected', title: 'Your seller application was not approved', body: note?.trim() ?? '', link: '/dashboard/settings' },
      suspended: { type: 'seller_suspended', title: 'Your seller account was suspended', body: note?.trim() ?? '', link: '/dashboard' },
    }[next] as { type: 'seller_approved' | 'seller_rejected' | 'seller_suspended'; title: string; body: string; link: string };
    await this.notifications.notify(s.user_id, { ...msg, type: decision === 'reinstate' ? 'seller_reinstated' : msg.type });
    return { status: next };
  }

  async findIdBySlugOrEmail(ident: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT s.id FROM seller_profiles s JOIN users u ON u.id = s.user_id WHERE s.slug = $1 OR u.email = $1 LIMIT 1`, [ident.toLowerCase()]);
    return rows[0]?.id ?? null;
  }
}
