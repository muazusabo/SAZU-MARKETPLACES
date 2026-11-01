import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly db: DatabaseService) {}

  /** Sensitive administrative action: who, what, to which resource, with context. Append-only in the database. */
  async record(actorId: string, action: string, resourceType: string | null, resourceId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.db.query('INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, metadata) VALUES ($1, $2, $3, $4, $5)', [actorId, action, resourceType, resourceId, metadata]);
    } catch (e) { this.logger.error(`AUDIT WRITE FAILED for ${action}: ${(e as Error).message}`); }
  }

  /** A moderation decision on a listing, seller, user or report, with its reason. */
  async decision(moderatorId: string, targetType: 'product' | 'seller' | 'user' | 'report', targetId: string, action: string, reason?: string | null): Promise<void> {
    await this.db.query('INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, reason) VALUES ($1, $2, $3, $4, $5)', [moderatorId, targetType, targetId, action, reason?.trim() || null]);
    await this.record(moderatorId, `${targetType}.${action}`, targetType, targetId, reason ? { reason } : {});
  }

  async history(targetType: string, targetId: string) {
    const { rows } = await this.db.query<{ id: string; action: string; reason: string | null; created_at: Date; moderator: string | null }>(
      `SELECT m.id, m.action, m.reason, m.created_at, p.display_name AS moderator FROM moderation_actions m
       LEFT JOIN profiles p ON p.user_id = m.moderator_id WHERE m.target_type = $1 AND m.target_id = $2 ORDER BY m.created_at DESC LIMIT 50`, [targetType, targetId]);
    return rows.map((r) => ({ id: r.id, action: r.action, reason: r.reason, moderator: r.moderator, createdAt: r.created_at }));
  }
}
