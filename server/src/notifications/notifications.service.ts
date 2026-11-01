import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RealtimeService } from '../realtime/realtime.service';

export type NotificationType =
  | 'new_message' | 'seller_approved' | 'seller_rejected' | 'seller_suspended' | 'seller_reinstated'
  | 'listing_approved' | 'listing_rejected' | 'listing_expiring' | 'moderation_action' | 'report_update';

export interface NotifyInput { type: NotificationType; title: string; body?: string | null; link?: string | null; data?: Record<string, unknown> }

interface Row { id: string; type: string; title: string; body: string | null; link: string | null; data: Record<string, unknown>; read_at: Date | null; created_at: Date }
const present = (r: Row) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, data: r.data, read: r.read_at !== null, createdAt: r.created_at });

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly db: DatabaseService, private readonly realtime: RealtimeService) {}

  /** Never throws: a notification problem must not fail the action that caused it. */
  async notify(userId: string, n: NotifyInput): Promise<void> {
    try {
      const { rows } = await this.db.query<Row>(
        `INSERT INTO notifications (user_id, type, title, body, link, data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, n.type, n.title.slice(0, 120), n.body?.slice(0, 300) ?? null, n.link ?? null, n.data ?? {}]);
      this.realtime.emitToUser(userId, 'notification:new', present(rows[0]!));
    } catch (e) { this.logger.warn(`notify failed: ${(e as Error).message}`); }
  }

  /** One unread notification per conversation: later messages refresh it and bump a counter. */
  async notifyNewMessage(recipientId: string, conversationId: string, from: string, snippet: string): Promise<void> {
    try {
      const { rows } = await this.db.query<Row>(
        `INSERT INTO notifications (user_id, type, title, body, link, data)
         VALUES ($1, 'new_message', $2, $3, $4, jsonb_build_object('conversationId', $5::text, 'count', 1))
         ON CONFLICT (user_id, (data ->> 'conversationId')) WHERE type = 'new_message' AND read_at IS NULL
         DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now(),
                       data = jsonb_set(notifications.data, '{count}', to_jsonb(COALESCE((notifications.data ->> 'count')::int, 1) + 1))
         RETURNING *`,
        [recipientId, `New message from ${from}`.slice(0, 120), snippet.slice(0, 120), `/messages/${conversationId}`, conversationId]);
      this.realtime.emitToUser(recipientId, 'notification:new', present(rows[0]!));
    } catch (e) { this.logger.warn(`notifyNewMessage failed: ${(e as Error).message}`); }
  }

  async list(userId: string, page: number, pageSize: number) {
    const { rows } = await this.db.query<Row & { total: string }>(
      `SELECT *, count(*) OVER() AS total FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [userId, pageSize, (page - 1) * pageSize]);
    const total = rows[0] ? Number(rows[0].total) : 0;
    return { data: rows.map(present), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), unreadCount: await this.unreadCount(userId) } };
  }

  async unreadCount(userId: string): Promise<number> {
    const r = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return r.rows[0]!.n;
  }

  async markRead(userId: string, id: string): Promise<void> {
    const r = await this.db.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!r.rowCount) throw new NotFoundException('Notification not found.');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  }
}
