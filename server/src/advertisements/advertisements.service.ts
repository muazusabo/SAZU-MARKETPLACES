import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertUpload } from '../common/upload';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ImageService } from '../storage/image.service';
import { StorageService } from '../storage/storage.service';
import { AdPlacement, AdStatus, CreateAdvertisementDto } from './dto/advertisement.dto';

type AdRow = {
  id: string; title: string; advertiser_name: string; description: string; image_path: string; destination_url: string;
  placement: AdPlacement; category_id: string | null; category_slug: string | null; start_at: Date; end_at: Date;
  status: AdStatus; impressions: string; clicks: string; created_at: Date; updated_at: Date;
};

@Injectable()
export class AdvertisementsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly audit: AuditService,
  ) {}

  async adminList() {
    const { rows } = await this.db.query<AdRow>(
      `SELECT a.*, c.slug AS category_slug FROM advertisements a LEFT JOIN categories c ON c.id = a.category_id
       ORDER BY a.created_at DESC`,
    );
    const ads = rows.map((row) => this.toAdmin(row));
    const totals = ads.reduce((acc, ad) => {
      acc.total += 1;
      if (ad.status === 'active') acc.active += 1;
      if (ad.status === 'scheduled') acc.scheduled += 1;
      if (ad.status === 'expired') acc.expired += 1;
      if (ad.status === 'paused') acc.paused += 1;
      acc.impressions += ad.impressions;
      acc.clicks += ad.clicks;
      return acc;
    }, { total: 0, active: 0, scheduled: 0, expired: 0, paused: 0, impressions: 0, clicks: 0 });
    return { totals: { ...totals, clickThroughRate: totals.impressions ? totals.clicks / totals.impressions : 0 }, advertisements: ads };
  }

  async forPlacement(placement: AdPlacement, category?: string) {
    const { rows } = await this.db.query<AdRow>(
      `SELECT a.*, c.slug AS category_slug FROM advertisements a
       LEFT JOIN categories c ON c.id = a.category_id
       WHERE a.status = 'published' AND a.placement = $1 AND a.start_at <= now() AND a.end_at >= now()
         AND (($1 = 'category_banner' AND c.slug = $2 AND c.is_active = true) OR $1 <> 'category_banner')
       ORDER BY a.created_at ASC`,
      [placement, category ?? null],
    );
    return rows.map((row) => ({
      id: row.id, title: row.title, advertiserName: row.advertiser_name, description: row.description,
      imageUrl: this.storage.publicUrl(row.image_path),
    }));
  }

  async create(actorId: string, dto: CreateAdvertisementDto, file?: Express.Multer.File) {
    const imagePath = await this.storeBanner(file);
    try {
      await this.validateCampaign(dto);
      const { rows } = await this.db.query<AdRow>(
        `INSERT INTO advertisements
          (title, advertiser_name, description, image_path, destination_url, placement, category_id, start_at, end_at, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         RETURNING *, NULL::text AS category_slug`,
        [this.clean(dto.title), this.clean(dto.advertiserName), this.clean(dto.description), imagePath, this.destination(dto.destinationUrl), dto.placement,
          dto.placement === 'category_banner' ? dto.categoryId : null, dto.startAt, dto.endAt, dto.status, actorId],
      );
      const row = rows[0]!;
      await this.audit.record(actorId, 'advertisement.created', 'advertisement', row.id, { placement: row.placement, status: row.status });
      return this.toAdmin(row);
    } catch (error) {
      await this.storage.deletePublic(imagePath);
      throw error;
    }
  }

  async update(actorId: string, id: string, dto: CreateAdvertisementDto, file?: Express.Multer.File) {
    const previous = await this.getOne(id);
    await this.validateCampaign(dto);
    const newImage = file ? await this.storeBanner(file) : previous.image_path;
    try {
      const { rows } = await this.db.query<AdRow>(
        `UPDATE advertisements SET title=$2, advertiser_name=$3, description=$4, image_path=$5, destination_url=$6,
          placement=$7, category_id=$8, start_at=$9, end_at=$10, status=$11, updated_by=$12, updated_at=now()
         WHERE id=$1 RETURNING *, NULL::text AS category_slug`,
        [id, this.clean(dto.title), this.clean(dto.advertiserName), this.clean(dto.description), newImage, this.destination(dto.destinationUrl), dto.placement,
          dto.placement === 'category_banner' ? dto.categoryId : null, dto.startAt, dto.endAt, dto.status, actorId],
      );
      const row = rows[0]!;
      if (newImage !== previous.image_path) await this.storage.deletePublic(previous.image_path);
      await this.audit.record(actorId, 'advertisement.updated', 'advertisement', id, { placement: row.placement, status: row.status });
      return this.toAdmin(row);
    } catch (error) {
      if (newImage !== previous.image_path) await this.storage.deletePublic(newImage);
      throw error;
    }
  }

  async setStatus(actorId: string, id: string, status: 'published' | 'paused') {
    if (!['published', 'paused'].includes(status)) throw new BadRequestException('Choose published or paused.');
    if (status === 'published') {
      const campaign = await this.db.query<{ end_at: Date }>('SELECT end_at FROM advertisements WHERE id=$1', [id]);
      if (!campaign.rows[0]) throw new NotFoundException('Advertisement not found.');
      if (new Date(campaign.rows[0].end_at).getTime() <= Date.now()) {
        throw new BadRequestException('This campaign has ended. Edit its dates before reactivating it.');
      }
    }
    const { rows } = await this.db.query<AdRow>(
      `UPDATE advertisements SET status=$2, updated_by=$3, updated_at=now() WHERE id=$1 AND status <> 'draft'
       RETURNING *, NULL::text AS category_slug`, [id, status, actorId],
    );
    const row = rows[0];
    if (!row) {
      const exists = await this.db.query('SELECT 1 FROM advertisements WHERE id=$1', [id]);
      if (!exists.rowCount) throw new NotFoundException('Advertisement not found.');
      throw new BadRequestException('Publish the draft by editing it before pausing or reactivating it.');
    }
    await this.audit.record(actorId, status === 'paused' ? 'advertisement.paused' : 'advertisement.reactivated', 'advertisement', id);
    return this.toAdmin(row);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const row = await this.getOne(id);
    await this.db.query('DELETE FROM advertisements WHERE id=$1', [id]);
    await this.storage.deletePublic(row.image_path);
    await this.audit.record(actorId, 'advertisement.deleted', 'advertisement', id, { title: row.title });
  }

  async recordImpression(id: string, visitorId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO advertisement_events (advertisement_id, event_type, visitor_id)
         SELECT id, 'impression', $2 FROM advertisements
         WHERE id=$1 AND status='published' AND start_at <= now() AND end_at >= now()
         ON CONFLICT (advertisement_id, visitor_id) WHERE event_type='impression' AND visitor_id IS NOT NULL DO NOTHING
         RETURNING id`, [id, visitorId],
      );
      if (rows.length) await client.query('UPDATE advertisements SET impressions=impressions+1 WHERE id=$1', [id]);
    });
  }

  async recordClick(id: string): Promise<string> {
    const result = await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ destination_url: string }>(
        `SELECT destination_url FROM advertisements WHERE id=$1 AND status='published' AND start_at <= now() AND end_at >= now() FOR UPDATE`, [id],
      );
      if (!rows[0]) return null;
      await client.query(`INSERT INTO advertisement_events (advertisement_id, event_type) VALUES ($1,'click')`, [id]);
      await client.query('UPDATE advertisements SET clicks=clicks+1 WHERE id=$1', [id]);
      return rows[0].destination_url;
    });
    if (!result) throw new NotFoundException('This advertisement is no longer available.');
    return result;
  }

  private async getOne(id: string): Promise<AdRow> {
    const { rows } = await this.db.query<AdRow>(
      'SELECT a.*, c.slug AS category_slug FROM advertisements a LEFT JOIN categories c ON c.id=a.category_id WHERE a.id=$1', [id],
    );
    if (!rows[0]) throw new NotFoundException('Advertisement not found.');
    return rows[0];
  }

  private async validateCampaign(dto: CreateAdvertisementDto): Promise<void> {
    if (!Number.isFinite(Date.parse(dto.startAt)) || !Number.isFinite(Date.parse(dto.endAt)) || Date.parse(dto.endAt) <= Date.parse(dto.startAt)) {
      throw new BadRequestException('The end date must be after the start date.');
    }
    this.destination(dto.destinationUrl);
    if (dto.placement === 'category_banner') {
      if (!dto.categoryId) throw new BadRequestException('Choose a category for this placement.');
      const category = await this.db.query('SELECT 1 FROM categories WHERE id=$1 AND is_active=true', [dto.categoryId]);
      if (!category.rowCount) throw new BadRequestException('Choose an active category.');
    } else if (dto.categoryId) {
      throw new BadRequestException('A category can only be selected for a category-specific banner.');
    }
    if (dto.status === 'published' && Date.parse(dto.endAt) <= Date.now()) {
      throw new BadRequestException('A published campaign must end in the future.');
    }
  }

  private destination(value: string): string {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('Enter a valid destination URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new BadRequestException('Destination URLs must use HTTP or HTTPS and cannot contain login details.');
    }
    return url.toString();
  }

  private async storeBanner(file?: Express.Multer.File): Promise<string> {
    const maxBytes = await this.settings.get('max_image_bytes');
    const allowed = await this.settings.get('allowed_image_types');
    const input = assertUpload(file, typeof maxBytes === 'number' ? maxBytes : 5 * 1024 * 1024);
    const image = await this.images.processAdvertisementBanner(input, Array.isArray(allowed) ? allowed : undefined);
    const path = `ads/banners/${randomUUID()}.webp`;
    return this.storage.putPublic(path, image, 'image/webp');
  }

  private clean(value: string): string { return value.trim().split('\u0000').join(''); }
  private toAdmin(row: AdRow) {
    const now = Date.now();
    const status = row.status === 'paused' ? 'paused'
      : row.status === 'draft' ? 'draft'
      : new Date(row.start_at).getTime() > now ? 'scheduled'
      : new Date(row.end_at).getTime() < now ? 'expired' : 'active';
    const impressions = Number(row.impressions);
    const clicks = Number(row.clicks);
    return {
      id: row.id, title: row.title, advertiserName: row.advertiser_name, description: row.description,
      imageUrl: this.storage.publicUrl(row.image_path), destinationUrl: row.destination_url,
      placement: row.placement, categoryId: row.category_id, categorySlug: row.category_slug,
      startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString(),
      status, published: row.status === 'published', impressions, clicks,
      clickThroughRate: impressions ? clicks / impressions : 0,
      createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
