import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseService } from '../database/database.service';

describe('HealthController', () => {
  const make = (ok: boolean) =>
    new HealthController({ ping: jest.fn().mockResolvedValue(ok) } as unknown as DatabaseService);

  it('reports liveness', () => {
    expect(make(true).live().status).toBe('ok');
  });

  it('reports ready when the database is reachable', async () => {
    await expect(make(true).ready()).resolves.toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('returns 503 when the database is unreachable', async () => {
    await expect(make(false).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
