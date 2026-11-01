import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

/** Safe defaults used if a row is missing. Administrators change the live values from the admin dashboard. */
export const SETTING_DEFAULTS = {
  seller_approval_required: true,
  require_listing_image: true,
  max_images_per_listing: 6,
  max_image_bytes: 5 * 1024 * 1024,
  max_uploads_per_user_per_day: 60,
  max_active_listings_per_seller: 50,
  listing_expiry_days: 0,
  max_new_conversations_per_day: 30,
  max_wishlist_items: 200,
  max_messages_per_minute: 20,
  max_reports_per_day: 20,
  allowed_image_types: ['jpeg', 'png', 'webp'] as string[],
  student_verification_required: false,
  support_email: '',
  support_phone: '',
  community_guidelines: '',
  terms_text: '',
  privacy_text: '',
  about_text: '',
  site_logo_path: '',
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

type Def = { type: 'boolean' | 'int' | 'text' | 'image' | 'imageTypes'; group: string; label: string; min?: number; max?: number; maxLength?: number; public?: boolean };
/** What each setting is and what values it accepts. Everything an administrator can change is validated against this. */
export const SETTING_DEFS: Record<SettingKey, Def> = {
  seller_approval_required: { type: 'boolean', group: 'Sellers and listings', label: 'Require administrator approval for sellers' },
  require_listing_image: { type: 'boolean', group: 'Sellers and listings', label: 'Require at least one photo to submit a listing' },
  student_verification_required: { type: 'boolean', group: 'Sellers and listings', label: 'Student verification required (informational: verification flow not built yet)' },
  max_active_listings_per_seller: { type: 'int', min: 1, max: 1000, group: 'Sellers and listings', label: 'Pending plus published listings per seller' },
  listing_expiry_days: { type: 'int', min: 0, max: 3650, group: 'Sellers and listings', label: 'Days until a published listing expires (0 = never)' },
  max_images_per_listing: { type: 'int', min: 1, max: 12, group: 'Images', label: 'Maximum photos per listing' },
  max_image_bytes: { type: 'int', min: 100_000, max: 10 * 1024 * 1024, group: 'Images', label: 'Maximum size per image (bytes, up to 10 MB)' },
  max_uploads_per_user_per_day: { type: 'int', min: 1, max: 1000, group: 'Images', label: 'Image uploads per seller per 24 hours' },
  allowed_image_types: { type: 'imageTypes', group: 'Images', label: 'Allowed image formats' },
  max_new_conversations_per_day: { type: 'int', min: 1, max: 500, group: 'Anti-spam limits', label: 'New conversations a buyer can start per day' },
  max_messages_per_minute: { type: 'int', min: 1, max: 120, group: 'Anti-spam limits', label: 'Messages per user per minute' },
  max_reports_per_day: { type: 'int', min: 1, max: 200, group: 'Anti-spam limits', label: 'Reports per user per day' },
  max_wishlist_items: { type: 'int', min: 1, max: 5000, group: 'Anti-spam limits', label: 'Saved products per user' },
  support_email: { type: 'text', maxLength: 200, group: 'Contact and content', label: 'Support email', public: true },
  support_phone: { type: 'text', maxLength: 50, group: 'Contact and content', label: 'Support phone', public: true },
  about_text: { type: 'text', maxLength: 10_000, group: 'Contact and content', label: 'About page text', public: true },
  community_guidelines: { type: 'text', maxLength: 20_000, group: 'Contact and content', label: 'Community and safety guidelines', public: true },
  terms_text: { type: 'text', maxLength: 50_000, group: 'Contact and content', label: 'Terms of use', public: true },
  privacy_text: { type: 'text', maxLength: 50_000, group: 'Contact and content', label: 'Privacy policy', public: true },
  site_logo_path: { type: 'image', group: 'General', label: 'Site logo', public: true },
};
export const IMAGE_TYPES = ['jpeg', 'png', 'webp'];

@Injectable()
export class SettingsService {
  private cache?: { at: number; values: Record<string, unknown> };
  private readonly ttlMs: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('NODE_ENV', { infer: true }) === 'test' ? 0 : 15_000;
  }

  private async load(): Promise<Record<string, unknown>> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.values;
    const { rows } = await this.db.query<{ key: string; value: unknown }>('SELECT key, value FROM platform_settings');
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
    const v = (await this.load())[key];
    const d = SETTING_DEFAULTS[key];
    return (typeof v === typeof d && Array.isArray(v) === Array.isArray(d) ? v : d) as (typeof SETTING_DEFAULTS)[K];
  }

  /** Public site content only (never limits or internal switches). */
  async publicContent(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, def] of Object.entries(SETTING_DEFS)) if (def.public) out[k] = await this.get(k as SettingKey) as string;
    out.site_logo_url = this.storage.publicUrl(out.site_logo_path) ?? '';
    delete out.site_logo_path;
    return out;
  }

  async all() {
    this.cache = undefined;
    const { rows } = await this.db.query<{ key: string; value: unknown; description: string | null; updated_at: Date }>('SELECT key, value, description, updated_at FROM platform_settings ORDER BY key');
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return (Object.keys(SETTING_DEFS) as SettingKey[]).map((key) => {
      const value = byKey.get(key)?.value ?? SETTING_DEFAULTS[key];
      return {
        key,
        ...SETTING_DEFS[key],
        value: SETTING_DEFS[key].type === 'image' ? this.storage.publicUrl(value as string) ?? '' : value,
        updatedAt: byKey.get(key)?.updated_at ?? null,
      };
    });
  }

  validate(key: string, value: unknown): unknown {
    const def = (SETTING_DEFS as Record<string, Def>)[key];
    if (!def) throw new NotFoundException('Unknown setting.');
    const bad = (m: string) => new BadRequestException(m);
    if (def.type === 'boolean') { if (typeof value !== 'boolean') throw bad('This setting must be true or false.'); return value; }
    if (def.type === 'int') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < (def.min ?? 0) || value > (def.max ?? Number.MAX_SAFE_INTEGER)) throw bad(`Enter a whole number between ${def.min} and ${def.max}.`);
      return value;
    }
    if (def.type === 'imageTypes') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || !IMAGE_TYPES.includes(v)) || new Set(value).size !== value.length) {
        throw bad(`Choose at least one of: ${IMAGE_TYPES.join(', ')}.`);
      }
      return value;
    }
    if (typeof value !== 'string') throw bad('This setting must be text.');
    if (def.type === 'image') {
      if (value && !/^(?:cloudinary:)?branding\/logo\/[a-f0-9-]+\.webp$/.test(value)) {
        throw bad('Upload a valid site logo image.');
      }
      return value;
    }
    if (value.length > (def.maxLength ?? 1000)) throw bad(`Keep this under ${(def.maxLength ?? 1000).toLocaleString('en-NG')} characters.`);
    return value.split('\u0000').join(''); // NUL bytes are never valid in text
  }

  /** Returns the previous value so callers can write it to the audit log. */
  async set(key: string, value: unknown, actorId: string): Promise<{ before: unknown; after: unknown }> {
    const clean = this.validate(key, value);
    const prev = await this.db.query<{ value: unknown }>('SELECT value FROM platform_settings WHERE key = $1', [key]);
    await this.db.query(
      `INSERT INTO platform_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`, [key, JSON.stringify(clean), actorId]);
    this.cache = undefined;
    return { before: prev.rows[0]?.value ?? SETTING_DEFAULTS[key as SettingKey], after: clean };
  }
}
