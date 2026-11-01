import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { Env } from '../config/env';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('stores only a server-keyed hash of the browser visitor identifier', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const db = { query } as unknown as DatabaseService;
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService<Env, true>;
    const service = new AnalyticsService(db, config);
    const visitorId = 'cfd2cd65-d928-4859-9528-59a59d021a26';
    const hash = createHash('sha256').update(`test-secret|${visitorId}`).digest('hex');

    await service.heartbeat(visitorId);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (visitor_hash) DO UPDATE SET last_seen_at = now()'),
      [hash],
    );
    expect(query.mock.calls[0]?.[1]).not.toContain(visitorId);
  });
});
