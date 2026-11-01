import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { SellerAccountService } from '../sellers/seller-account.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';

const paged = (page = 1, pageSize = 20) => ({ page, pageSize, offset: (page - 1) * pageSize });
const meta = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const needReason = (r: string | undefined, what: string): string => {
  if (!r || r.trim().length < 3) throw new BadRequestException(`Give a reason (at least 3 characters). ${what}`);
  return r.trim();
};

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly db: DatabaseService, private readonly sellers: SellerAccountService, private readonly products: ProductsService,
    private readonly notifications: NotificationsService, private readonly audit: AuditService, private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  // ---------------- overview ----------------
  /** Every number is a live query: nothing here is hardcoded. */
  async overview() {
    const { rows } = await this.db.query<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM users WHERE status <> 'deleted') AS users,
              (SELECT count(*)::int FROM site_visitors) AS unique_visitors,
              (SELECT count(*)::int FROM site_visitors WHERE last_seen_at >= now() - interval '2 minutes') AS online_visitors,
              (SELECT count(*)::int FROM seller_profiles WHERE status = 'approved') AS approved_sellers,
              (SELECT count(*)::int FROM seller_profiles WHERE status = 'pending') AS pending_sellers,
              (SELECT count(*)::int FROM products p JOIN seller_profiles s ON s.id = p.seller_id
                 WHERE p.status = 'published' AND s.status IN ('approved', 'pending') AND p.availability IN ('available', 'reserved')) AS active_listings,
              (SELECT count(*)::int FROM products WHERE status = 'pending_review') AS pending_listings,
              (SELECT count(DISTINCT target_id)::int FROM reports WHERE target_type = 'product' AND status IN ('open', 'reviewing')) AS reported_products,
              (SELECT count(*)::int FROM reports WHERE status IN ('open', 'reviewing')) AS open_reports`);
    const activity = await this.db.query<{ id: string; action: string; resource_type: string | null; resource_id: string | null; created_at: Date; actor: string | null }>(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at, p.display_name AS actor
       FROM audit_logs a LEFT JOIN profiles p ON p.user_id = a.actor_id ORDER BY a.created_at DESC LIMIT 10`);
    const r = rows[0]!;
    return {
      metrics: {
        totalUsers: r.users, uniqueVisitors: r.unique_visitors, onlineVisitors: r.online_visitors,
        approvedSellers: r.approved_sellers, pendingSellerApplications: r.pending_sellers, activeListings: r.active_listings,
        pendingListingReviews: r.pending_listings, reportedProducts: r.reported_products, openReports: r.open_reports,
      },
      recentActivity: activity.rows.map((a) => ({ id: a.id, action: a.action, resourceType: a.resource_type, resourceId: a.resource_id, actor: a.actor, createdAt: a.created_at })),
    };
  }

  // ---------------- sellers ----------------
  async sellerApplications(status = 'pending', page = 1, pageSize = 20) {
    const { offset } = paged(page, pageSize);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT s.id, s.slug, s.shop_name, s.description, s.status, s.review_note, s.submitted_at, s.approved_at, (s.verified_at IS NOT NULL) AS verified,
              u.id AS user_id, u.email, (u.email_verified_at IS NOT NULL) AS email_verified, p.display_name,
              COALESCE((SELECT json_agg(c.name ORDER BY c.sort_order) FROM seller_profile_categories sc JOIN categories c ON c.id = sc.category_id WHERE sc.seller_id = s.id), '[]') AS categories,
              count(*) OVER() AS total
       FROM seller_profiles s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.user_id = u.id
       WHERE ($1 = 'all' OR s.status = $1) ORDER BY s.submitted_at ASC NULLS LAST, s.created_at ASC LIMIT $2 OFFSET $3`, [status, pageSize, offset]);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => ({
        id: r.id, slug: r.slug, shopName: r.shop_name, description: r.description, status: r.status, reviewNote: r.review_note, submittedAt: r.submitted_at, verified: r.verified,
        categories: r.categories, user: { id: r.user_id, email: r.email, emailVerified: r.email_verified, displayName: r.display_name },
      })),
      meta: meta(page, pageSize, total),
    };
  }

  async reviewSeller(moderatorId: string, sellerId: string, decision: 'approve' | 'reject' | 'suspend' | 'reinstate', note?: string) {
    const r = await this.sellers.review(sellerId, decision, note); // validates transitions, requires reasons, notifies the seller
    await this.audit.decision(moderatorId, 'seller', sellerId, decision, note);
    return r;
  }

  /** The "Verified seller" badge is only ever set here, by an administrator's explicit action. */
  async setSellerVerified(adminId: string, sellerId: string, verified: boolean, note?: string) {
    const r = await this.db.query(`UPDATE seller_profiles SET verified_at = CASE WHEN $2 THEN COALESCE(verified_at, now()) ELSE NULL END WHERE id = $1 AND status = 'approved'`, [sellerId, verified]);
    if (!r.rowCount) throw new NotFoundException('Approved seller not found.');
    await this.audit.decision(adminId, 'seller', sellerId, verified ? 'verify' : 'unverify', note);
    return { verified };
  }

  // ---------------- listings ----------------
  async listings(status = 'pending_review', q: string | undefined, page = 1, pageSize = 20) {
    const { offset } = paged(page, pageSize);
    const params: unknown[] = [];
    const where: string[] = [];
    if (status !== 'all') { params.push(status); where.push(`p.status = $${params.length}`); }
    if (q) { params.push(`%${likeEscape(q)}%`); where.push(`(p.title ILIKE $${params.length} ESCAPE '\\' OR s.shop_name ILIKE $${params.length} ESCAPE '\\')`); }
    params.push(pageSize, offset);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.price_kobo, p.status, p.availability, p.updated_at, p.published_at, c.name AS category,
              s.id AS seller_id, s.slug AS seller_slug, s.shop_name, COALESCE(img.thumb_path, img.storage_path) AS image_path,
              (SELECT count(*)::int FROM reports r WHERE r.target_type = 'product' AND r.target_id = p.id AND r.status IN ('open', 'reviewing')) AS open_reports,
              count(*) OVER() AS total
       FROM products p JOIN seller_profiles s ON s.id = p.seller_id JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (SELECT storage_path, thumb_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) img ON true
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${status === 'pending_review' ? 'p.updated_at ASC' : 'p.updated_at DESC'}, p.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => ({
        id: r.id, slug: r.slug, title: r.title, priceKobo: Number(r.price_kobo), status: r.status, availability: r.availability, updatedAt: r.updated_at, category: r.category,
        seller: { id: r.seller_id, slug: r.seller_slug, shopName: r.shop_name }, imageUrl: this.storage.publicUrl(r.image_path as string | null), openReports: r.open_reports,
      })),
      meta: meta(page, pageSize, total),
    };
  }

  /** Full inspection view of any listing, whatever its status. */
  async listing(id: string) {
    const detail = await this.products.detailWhere('p.id = $1', [id]);
    if (!detail) throw new NotFoundException('Listing not found.');
    const [extra, imgs, history, reports] = await Promise.all([
      this.db.query<{ status: string; rejection_reason: string | null; seller_status: string; seller_user: string }>(
        'SELECT p.status, p.rejection_reason, s.status AS seller_status, s.user_id AS seller_user FROM products p JOIN seller_profiles s ON s.id = p.seller_id WHERE p.id = $1', [id]),
      this.db.query<{ storage_path: string; thumb_path: string | null; alt_text: string | null }>('SELECT storage_path, thumb_path, alt_text FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at', [id]),
      this.audit.history('product', id),
      this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM reports WHERE target_type = 'product' AND target_id = $1 AND status IN ('open', 'reviewing')`, [id]),
    ]);
    const e = extra.rows[0]!;
    return {
      ...detail, id, status: e.status, rejectionReason: e.rejection_reason, sellerStatus: e.seller_status, sellerUserId: e.seller_user, openReports: reports.rows[0]!.n,
      images: imgs.rows.map((i) => ({ url: this.storage.publicUrl(i.storage_path), thumbUrl: this.storage.publicUrl(i.thumb_path ?? i.storage_path), alt: i.alt_text || detail.title })),
      history,
    };
  }

  async reviewListing(moderatorId: string, id: string, decision: 'approve' | 'reject' | 'remove' | 'restore', reason?: string) {
    const { rows } = await this.db.query<{ slug: string; title: string; status: string; published_at: Date | null; seller_user: string }>(
      'SELECT p.slug, p.title, p.status, p.published_at, s.user_id AS seller_user FROM products p JOIN seller_profiles s ON s.id = p.seller_id WHERE p.id = $1', [id]);
    const p = rows[0];
    if (!p) throw new NotFoundException('Listing not found.');
    const conflict = (m: string) => new ConflictException(m);
    const title = p.title.slice(0, 60);

    if (decision === 'approve') {
      if (p.status !== 'pending_review') throw conflict(`Only listings awaiting review can be approved (this one is "${p.status}").`);
      const days = await this.settings.get('listing_expiry_days');
      await this.db.query(
        `UPDATE products SET status = 'published', rejection_reason = NULL, published_at = COALESCE(published_at, now()),
           expires_at = CASE WHEN $2::int > 0 THEN now() + make_interval(days => $2::int) ELSE NULL END WHERE id = $1`, [id, days]);
      await this.notifications.notify(p.seller_user, { type: 'listing_approved', title: `Your listing “${title}” is live`, body: 'Buyers can now find it.', link: `/product/${p.slug}`, data: { productId: id } });
    } else if (decision === 'reject') {
      const why = needReason(reason, 'The seller will see it.');
      if (p.status !== 'pending_review') throw conflict(`Only listings awaiting review can be rejected (this one is "${p.status}").`);
      await this.db.query(`UPDATE products SET status = 'rejected', rejection_reason = $2 WHERE id = $1`, [id, why]);
      await this.notifications.notify(p.seller_user, { type: 'listing_rejected', title: `Your listing “${title}” was not approved`, body: why, link: `/dashboard/listings/${id}/edit`, data: { productId: id } });
    } else if (decision === 'remove') {
      const why = needReason(reason, 'The seller will see it.');
      if (p.status === 'removed') throw conflict('This listing is already removed.');
      await this.db.query(`UPDATE products SET status = 'removed', rejection_reason = $2 WHERE id = $1`, [id, why]);
      await this.notifications.notify(p.seller_user, { type: 'moderation_action', title: `Your listing “${title}” was removed`, body: why, link: '/dashboard', data: { productId: id } });
    } else {
      if (p.status !== 'removed') throw conflict('Only removed listings can be restored.');
      // Back where it was: live if it had been public before, otherwise into the review queue.
      await this.db.query(`UPDATE products SET status = CASE WHEN published_at IS NOT NULL THEN 'published' ELSE 'pending_review' END, rejection_reason = NULL WHERE id = $1`, [id]);
      await this.notifications.notify(p.seller_user, { type: 'moderation_action', title: `Your listing “${title}” was restored`, body: reason?.trim() || null, link: '/dashboard', data: { productId: id } });
    }
    await this.audit.decision(moderatorId, 'product', id, decision, reason);
    return this.listing(id);
  }

  // ---------------- reports ----------------
  async reports(status = 'active', targetType: string | undefined, page = 1, pageSize = 20) {
    const { offset } = paged(page, pageSize);
    const params: unknown[] = [];
    const where: string[] = [];
    if (status === 'active') where.push(`r.status IN ('open', 'reviewing')`);
    else if (status !== 'all') { params.push(status); where.push(`r.status = $${params.length}`); }
    if (targetType) { params.push(targetType); where.push(`r.target_type = $${params.length}`); }
    params.push(pageSize, offset);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.created_at ASC, r.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return { data: rows.map(presentReport), meta: meta(page, pageSize, total) };
  }

  async report(moderatorId: string, id: string) {
    const { rows } = await this.db.query<Record<string, unknown>>(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException('Report not found.');
    const base = presentReport(rows[0]);
    let conversation: unknown = null;
    if (base.targetType === 'conversation') {
      // Reading a conversation is sensitive: it is only possible through a report, and every access is audit-logged.
      const msgs = await this.db.query<{ id: string; body: string; created_at: Date; role: string; name: string }>(
        `SELECT m.id::text AS id, m.body, m.created_at, cp.role, pr.display_name AS name FROM messages m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = m.sender_id
         JOIN profiles pr ON pr.user_id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.id DESC LIMIT 200`, [base.targetId]);
      conversation = msgs.rows.reverse().map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at, role: m.role, name: m.name }));
      await this.audit.record(moderatorId, 'report.view_conversation', 'report', id, { conversationId: base.targetId });
    }
    return { ...base, details: rows[0]!.details, resolutionNote: rows[0]!.resolution_note, conversation, history: await this.audit.history('report', id) };
  }

  async updateReport(moderatorId: string, id: string, status: 'reviewing' | 'resolved' | 'dismissed', note?: string) {
    const { rows } = await this.db.query<{ status: string; reporter_id: string }>('SELECT status, reporter_id FROM reports WHERE id = $1', [id]);
    const r = rows[0];
    if (!r) throw new NotFoundException('Report not found.');
    if (['resolved', 'dismissed'].includes(r.status)) throw new ConflictException('This report has already been closed.');
    if (status === 'reviewing' && r.status === 'reviewing') throw new ConflictException('This report is already being reviewed.');
    const closing = status !== 'reviewing';
    const why = closing ? needReason(note, 'It is kept with the report for other moderators.') : note?.trim();
    await this.db.query(
      `UPDATE reports SET status = $2, resolution_note = COALESCE($3, resolution_note), resolved_by = CASE WHEN $4 THEN $5::uuid ELSE resolved_by END,
         resolved_at = CASE WHEN $4 THEN now() ELSE resolved_at END WHERE id = $1`, [id, status, why ?? null, closing, moderatorId]);
    await this.audit.decision(moderatorId, 'report', id, status, why);
    if (closing) {
      // Generic on purpose: the reporter is thanked but not told what happened to the reported person.
      await this.notifications.notify(r.reporter_id, {
        type: 'report_update', title: 'We reviewed your report',
        body: status === 'resolved' ? 'Thank you. We looked into it and took action where it was needed.' : 'Thank you. We reviewed it and did not find a breach of our rules.',
        link: '/messages',
      });
    }
    return this.report(moderatorId, id);
  }
}

const REPORT_SELECT = `
  SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.resolution_note, r.created_at, r.resolved_at,
         rp.display_name AS reporter_name,
         COALESCE(p.title, sp.shop_name, up.display_name) AS target_label, p.slug AS product_slug, sp.slug AS seller_slug,
         (SELECT count(*)::int FROM reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS reports_on_target,
         count(*) OVER() AS total
  FROM reports r
  JOIN profiles rp ON rp.user_id = r.reporter_id
  LEFT JOIN products p ON r.target_type = 'product' AND p.id = r.target_id
  LEFT JOIN seller_profiles sp ON r.target_type = 'seller' AND sp.id = r.target_id
  LEFT JOIN profiles up ON r.target_type = 'user' AND up.user_id = r.target_id`;

function presentReport(r: Record<string, unknown>) {
  return {
    id: r.id, targetType: r.target_type as string, targetId: r.target_id as string, targetLabel: r.target_label ?? (r.target_type === 'conversation' ? 'Conversation' : 'Unavailable'),
    productSlug: r.product_slug, sellerSlug: r.seller_slug, reason: r.reason, status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at,
    reporter: r.reporter_name, reportsOnTarget: r.reports_on_target, details: r.details, resolutionNote: r.resolution_note,
  };
}
