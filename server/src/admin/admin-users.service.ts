import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

@Injectable()
export class AdminUsersService {
  constructor(private readonly db: DatabaseService, private readonly sessions: SessionService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  async list(q: string | undefined, status = 'all', role: string | undefined, page = 1, pageSize = 20) {
    const params: unknown[] = []; const where: string[] = [];
    if (q) { params.push(`%${likeEscape(q)}%`); where.push(`(u.email ILIKE $${params.length} ESCAPE '\\' OR p.display_name ILIKE $${params.length} ESCAPE '\\' OR p.full_name ILIKE $${params.length} ESCAPE '\\')`); }
    if (status !== 'all') { params.push(status); where.push(`u.status = $${params.length}`); }
    if (role) { params.push(role); where.push(`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = $${params.length})`); }
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT u.id, u.email, u.status, (u.email_verified_at IS NOT NULL) AS email_verified, u.created_at, u.last_login_at, p.display_name, p.student_verification_status,
              COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM user_roles r WHERE r.user_id = u.id), '{}') AS roles, sp.status AS seller_status, count(*) OVER() AS total
       FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.created_at DESC, u.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, status: r.status, roles: r.roles, emailVerified: r.email_verified, sellerStatus: r.seller_status,
        studentVerification: r.student_verification_status, createdAt: r.created_at, lastLoginAt: r.last_login_at })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /** Never includes the password hash or tokens. Contact details are visible to administrators only, for investigations. */
  async detail(id: string) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT u.id, u.email, u.status, (u.email_verified_at IS NOT NULL) AS email_verified, u.created_at, u.last_login_at, u.failed_login_count,
              p.full_name, p.display_name, p.phone, p.campus_area, p.student_verification_status,
              COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM user_roles r WHERE r.user_id = u.id), '{}') AS roles,
              sp.id AS seller_id, sp.shop_name, sp.status AS seller_status, sp.slug AS seller_slug,
              (SELECT count(*)::int FROM products x WHERE x.seller_id = sp.id) AS listings,
              (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id) AS reports_filed,
              (SELECT count(*)::int FROM reports r WHERE (r.target_type = 'user' AND r.target_id = u.id) OR (r.target_type = 'seller' AND r.target_id = sp.id)) AS reports_against
       FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN seller_profiles sp ON sp.user_id = u.id WHERE u.id = $1`, [id]);
    const r = rows[0];
    if (!r) throw new NotFoundException('User not found.');
    return {
      id: r.id, email: r.email, emailVerified: r.email_verified, status: r.status, roles: r.roles, createdAt: r.created_at, lastLoginAt: r.last_login_at,
      profile: { fullName: r.full_name, displayName: r.display_name, phone: r.phone, campusArea: r.campus_area, studentVerification: r.student_verification_status },
      seller: r.seller_id ? { id: r.seller_id, shopName: r.shop_name, status: r.seller_status, slug: r.seller_slug, listings: r.listings } : null,
      activity: { reportsFiled: r.reports_filed, reportsAgainst: r.reports_against },
      history: await this.audit.history('user', id),
    };
  }

  async setStatus(adminId: string, id: string, status: 'active' | 'suspended', reason?: string) {
    if (id === adminId) throw new ForbiddenException('You can’t change your own account status.');
    const { rows } = await this.db.query<{ status: string; roles: string[] }>(
      `SELECT u.status, COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id = u.id), '{}') AS roles FROM users u WHERE u.id = $1`, [id]);
    const u = rows[0];
    if (!u) throw new NotFoundException('User not found.');
    if (u.roles.includes('admin')) throw new ForbiddenException('Administrator accounts can’t be suspended here. Revoke the role with the server-side CLI first.');
    if (status === 'suspended') {
      if (!reason || reason.trim().length < 3) throw new BadRequestException('Give a reason for the suspension (at least 3 characters).');
      if (u.status === 'suspended') throw new ConflictException('This account is already suspended.');
      if (!['active', 'deactivated'].includes(u.status)) throw new ConflictException(`A ${u.status} account can’t be suspended.`);
    } else if (u.status !== 'suspended') throw new ConflictException('Only suspended accounts can be reactivated.');
    await this.db.query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
    if (status === 'suspended') await this.sessions.revokeAllForUser(id); // signs them out everywhere right now
    else await this.notifications.notify(id, { type: 'moderation_action', title: 'Your account was reactivated', body: reason?.trim() || null, link: '/account' });
    await this.audit.decision(adminId, 'user', id, status === 'suspended' ? 'suspend' : 'reactivate', reason);
    return this.detail(id);
  }

  /** Only the moderator role can be granted over HTTP. The administrator role is server-side only (CLI). */
  async grantModerator(adminId: string, id: string) {
    const t = await this.db.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [id]);
    if (!t.rows[0]) throw new NotFoundException('User not found.');
    if (t.rows[0].status !== 'active') throw new ConflictException('Only active accounts can become moderators.');
    await this.db.query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, 'moderator', $2) ON CONFLICT DO NOTHING`, [id, adminId]);
    await this.audit.record(adminId, 'user.grant_moderator', 'user', id);
    return this.detail(id);
  }

  async revokeModerator(adminId: string, id: string) {
    const r = await this.db.query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'moderator'`, [id]);
    if (r.rowCount) await this.audit.record(adminId, 'user.revoke_moderator', 'user', id);
    return this.detail(id);
  }

  /** Records an administrator's own judgement. There is no evidence upload yet, and no verification rule is assumed. */
  async setStudentVerification(adminId: string, id: string, status: string, note?: string) {
    const r = await this.db.query('UPDATE profiles SET student_verification_status = $2 WHERE user_id = $1', [id, status]);
    if (!r.rowCount) throw new NotFoundException('User not found.');
    await this.audit.record(adminId, 'user.student_verification', 'user', id, { status, ...(note ? { note } : {}) });
    return this.detail(id);
  }

  async auditLog(action: string | undefined, actorId: string | undefined, page = 1, pageSize = 30) {
    const params: unknown[] = []; const where: string[] = [];
    if (action) { params.push(`${likeEscape(action)}%`); where.push(`a.action ILIKE $${params.length} ESCAPE '\\'`); }
    if (actorId) { params.push(actorId); where.push(`a.actor_id = $${params.length}`); }
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at, a.actor_id, p.display_name AS actor, count(*) OVER() AS total
       FROM audit_logs a LEFT JOIN profiles p ON p.user_id = a.actor_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC, a.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      data: rows.map((r) => ({ id: r.id, action: r.action, resourceType: r.resource_type, resourceId: r.resource_id, metadata: r.metadata, actorId: r.actor_id, actor: r.actor, createdAt: r.created_at })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
