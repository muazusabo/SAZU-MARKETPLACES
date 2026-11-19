import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { RolesGuard } from '../auth/roles.guard';
import { AdminAdvertisementsController } from './advertisements.controller';
import { AdvertisementsService } from './advertisements.service';
import { ImageService } from '../storage/image.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';

const dto = {
  title: 'Campus stationery offer', advertiserName: 'Book Shop', description: 'Discounts on study supplies this week.',
  destinationUrl: 'https://example.com/offer', placement: 'home_banner' as const,
  startAt: '2026-11-19T10:00:00.000Z', endAt: '2026-12-19T10:00:00.000Z', status: 'published' as const,
};
const image = { buffer: Buffer.from('test-image'), size: 10 } as Express.Multer.File;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '4c7e7ac4-80d8-4e47-a7e3-0f9d35acd2d0', title: dto.title, advertiser_name: dto.advertiserName,
  description: dto.description, image_path: 'ads/banners/banner.webp', destination_url: dto.destinationUrl,
  placement: dto.placement, category_id: null, category_slug: null, start_at: new Date(dto.startAt), end_at: new Date(dto.endAt),
  status: 'published', impressions: '0', clicks: '0', created_at: new Date(dto.startAt), updated_at: new Date(dto.startAt), ...overrides,
});

function makeService() {
  const db = { query: jest.fn(), transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({ query: db.query })) } as unknown as DatabaseService;
  const settings = { get: jest.fn(async (key: string) => key === 'max_image_bytes' ? 5 * 1024 * 1024 : ['jpeg', 'png', 'webp']) } as unknown as SettingsService;
  const storage = { putPublic: jest.fn(async () => 'ads/banners/banner.webp'), publicUrl: jest.fn((path: string) => `/files/${path}`), deletePublic: jest.fn(async () => undefined) } as unknown as StorageService;
  const images = { processAdvertisementBanner: jest.fn(async () => Buffer.from('webp')) } as unknown as ImageService;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const service = new AdvertisementsService(db, settings, storage, images, audit);
  return { service, db, settings, storage, images, audit };
}

describe('AdvertisementsService', () => {
  it('creates a published campaign after storing and validating its banner', async () => {
    const { service, db, storage, audit } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [row()] });

    const result = await service.create('actor-id', dto, image);

    expect(result.status).toBe('active');
    expect(storage.putPublic).toHaveBeenCalledWith(expect.stringMatching(/^ads\/banners\/.+\.webp$/), expect.any(Buffer), 'image/webp');
    expect(audit.record).toHaveBeenCalledWith('actor-id', 'advertisement.created', 'advertisement', row().id, expect.any(Object));
  });

  it('returns only campaigns for a requested placement and passes the category filter through', async () => {
    const { service, db } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [row({ category_id: '4c7e7ac4-80d8-4e47-a7e3-0f9d35acd2d0', category_slug: 'books' })] });

    const result = await service.forPlacement('category_banner', 'books');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: row().id, advertiserName: dto.advertiserName, imageUrl: '/files/ads/banners/banner.webp' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("a.status = 'published' AND a.placement = $1 AND a.start_at <= now() AND a.end_at >= now()"), ['category_banner', 'books']);
  });

  it('derives scheduled, expired, paused, and draft statuses from campaign dates and state', async () => {
    const { service, db } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [
      row({ start_at: new Date('2099-01-01T00:00:00Z'), end_at: new Date('2099-02-01T00:00:00Z') }),
      row({ start_at: new Date('2020-01-01T00:00:00Z'), end_at: new Date('2020-02-01T00:00:00Z') }),
      row({ status: 'paused' }), row({ status: 'draft' }),
    ] });

    const result = await service.adminList();

    expect(result.advertisements.map((ad) => ad.status)).toEqual(['scheduled', 'expired', 'paused', 'draft']);
    expect(result.totals).toMatchObject({ total: 4, scheduled: 1, expired: 1, paused: 1, impressions: 0, clicks: 0 });
  });

  it('rejects unsafe URLs and cleans up the uploaded banner', async () => {
    const { service, storage, db } = makeService();
    await expect(service.create('actor-id', { ...dto, destinationUrl: 'javascript:alert(1)' }, image)).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expect(storage.deletePublic).toHaveBeenCalledWith('ads/banners/banner.webp');
  });

  it('requires an active category for category-specific placements', async () => {
    const { service, db, storage } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.create('actor-id', { ...dto, placement: 'category_banner', categoryId: '4c7e7ac4-80d8-4e47-a7e3-0f9d35acd2d0' }, image)).rejects.toThrow(BadRequestException);
    expect(storage.deletePublic).toHaveBeenCalledWith('ads/banners/banner.webp');
  });

  it('rejects campaign dates that end before they start', async () => {
    const { service, db, storage } = makeService();
    await expect(service.create('actor-id', { ...dto, endAt: dto.startAt }, image)).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expect(storage.deletePublic).toHaveBeenCalledWith('ads/banners/banner.webp');
  });

  it('counts an impression only when the deduplicated event insert succeeds', async () => {
    const { service, db } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'event-id' }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await service.recordImpression(row().id, '4c7e7ac4-80d8-4e47-a7e3-0f9d35acd2d0');
    await service.recordImpression(row().id, '4c7e7ac4-80d8-4e47-a7e3-0f9d35acd2d0');

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('records clicks only for a currently eligible campaign', async () => {
    const { service, db } = makeService();
    (db.transaction as jest.Mock).mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn({
      query: jest.fn().mockResolvedValueOnce({ rows: [{ destination_url: dto.destinationUrl }] }).mockResolvedValue({ rows: [] }),
    }));
    await expect(service.recordClick(row().id)).resolves.toBe(dto.destinationUrl);

    (db.transaction as jest.Mock).mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    await expect(service.recordClick(row().id)).rejects.toThrow(NotFoundException);
  });

  it('enforces the configured banner size limit before storage', async () => {
    const { service, storage } = makeService();
    const oversized = { ...image, size: 6 * 1024 * 1024 } as Express.Multer.File;
    await expect(service.create('actor-id', dto, oversized)).rejects.toThrow(PayloadTooLargeException);
    expect(storage.putPublic).not.toHaveBeenCalled();
  });

  it('pauses and reactivates an existing campaign while preventing expired reactivation', async () => {
    const { service, db, audit } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [row({ status: 'paused' })] });
    await expect(service.setStatus('actor-id', row().id, 'paused')).resolves.toMatchObject({ status: 'paused' });
    expect(audit.record).toHaveBeenCalledWith('actor-id', 'advertisement.paused', 'advertisement', row().id);

    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [row({ end_at: new Date(Date.now() - 1) })] });
    await expect(service.setStatus('actor-id', row().id, 'published')).rejects.toThrow(BadRequestException);
  });

  it('deletes campaign analytics and its stored banner with the ad', async () => {
    const { service, db, storage, audit } = makeService();
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [row()] }).mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await service.remove('actor-id', row().id);
    expect(db.query).toHaveBeenLastCalledWith('DELETE FROM advertisements WHERE id=$1', [row().id]);
    expect(storage.deletePublic).toHaveBeenCalledWith('ads/banners/banner.webp');
    expect(audit.record).toHaveBeenCalledWith('actor-id', 'advertisement.deleted', 'advertisement', row().id, { title: dto.title });
  });
});

describe('AdminAdvertisementsController authorization', () => {
  const context = (roles: string[] | undefined) => ({
    getHandler: () => AdminAdvertisementsController.prototype.create,
    getClass: () => AdminAdvertisementsController,
    switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
  }) as unknown as ExecutionContext;

  it('denies moderators and anonymous callers while allowing administrators', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(context(undefined))).toThrow();
    expect(() => guard.canActivate(context(['moderator']))).toThrow();
    expect(guard.canActivate(context(['admin']))).toBe(true);
  });
});
