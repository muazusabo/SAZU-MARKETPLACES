import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { Env } from '../config/env';

@Injectable()
export class AnalyticsService {
  private readonly secret: string;

  constructor(private readonly db: DatabaseService, config: ConfigService<Env, true>) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async heartbeat(visitorId: string): Promise<void> {
    const visitorHash = createHash('sha256').update(`${this.secret}|${visitorId}`).digest('hex');
    await this.db.query(
      `INSERT INTO site_visitors (visitor_hash)
       VALUES ($1)
       ON CONFLICT (visitor_hash) DO UPDATE SET last_seen_at = now()`,
      [visitorHash],
    );
  }
}
