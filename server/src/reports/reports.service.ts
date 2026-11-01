import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PRODUCT_FROM_SQL, VISIBLE_PRODUCT_SQL } from '../products/visibility';
import { SettingsService } from '../settings/settings.service';
import { CreateReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService) {}

  /**
   * The reporter must be allowed to see what they report: public listings and storefronts, or a conversation/person they
   * actually share. You cannot report yourself, your own listing or shop. Reports are confidential from the reported party.
   * Reporting a conversation lets moderators read that conversation (stated in the web form).
   */
  async create(userId: string, dto: CreateReportDto) {
    const cap = await this.settings.get('max_reports_per_day');
    const today = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '24 hours'`, [userId]);
    if (today.rows[0]!.n >= cap) throw new HttpException('You’ve filed a lot of reports today. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);

    await this.assertTarget(userId, dto.targetType, dto.targetId);
    try {
      const r = await this.db.query<{ id: string; status: string; created_at: Date }>(
        'INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at',
        [userId, dto.targetType, dto.targetId, dto.reason, dto.details ?? null]);
      return { id: r.rows[0]!.id, status: r.rows[0]!.status, createdAt: r.rows[0]!.created_at };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('You’ve already reported this. Our moderators are reviewing it.');
      throw e;
    }
  }

  private async assertTarget(userId: string, type: CreateReportDto['targetType'], id: string): Promise<void> {
    if (type === 'product') {
      const r = await this.db.query<{ owner: string }>(`SELECT s.user_id AS owner ${PRODUCT_FROM_SQL} WHERE p.id = $1 AND ${VISIBLE_PRODUCT_SQL}`, [id]);
      if (!r.rows[0]) throw new NotFoundException('That listing is not available to report.');
      if (r.rows[0].owner === userId) throw new BadRequestException('You can’t report your own listing.');
    } else if (type === 'seller') {
      const r = await this.db.query<{ user_id: string }>(`SELECT user_id FROM seller_profiles WHERE id = $1 AND status = 'approved'`, [id]);
      if (!r.rows[0]) throw new NotFoundException('That seller is not available to report.');
      if (r.rows[0].user_id === userId) throw new BadRequestException('You can’t report your own shop.');
    } else if (type === 'conversation') {
      const r = await this.db.query('SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [id, userId]);
      if (!r.rowCount) throw new NotFoundException('Conversation not found.');
    } else {
      if (id === userId) throw new BadRequestException('You can’t report yourself.');
      // Users can only be reported through a conversation they share, so ids can't be probed.
      const r = await this.db.query(
        `SELECT 1 FROM conversations c JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = $1
         JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = $2 LIMIT 1`, [userId, id]);
      if (!r.rowCount) throw new NotFoundException('That person is not available to report.');
    }
  }
}
