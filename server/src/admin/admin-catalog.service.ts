import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { slugify, uniqueSlug } from '../common/slug';
import { assertUpload } from '../common/upload';
import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { ImageService } from '../storage/image.service';
import { StorageService } from '../storage/storage.service';
import { AttributeDto, CreateCategoryDto, UpdateAttributeDto, UpdateCategoryDto } from './dto/admin.dto';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
  ) {}

  async categories() {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT c.id, c.slug, c.name, c.description, c.icon, c.sort_order, c.is_active, c.guidelines, c.max_images, par.slug AS parent_slug,
              (SELECT count(*)::int FROM category_attributes a WHERE a.category_id = c.id) AS attributes,
              (SELECT count(*)::int FROM products p WHERE p.category_id = c.id) AS products
       FROM categories c LEFT JOIN categories par ON par.id = c.parent_id ORDER BY COALESCE(par.sort_order, c.sort_order), par.name NULLS FIRST, c.sort_order, c.name`);
    return rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, description: r.description, icon: r.icon, sortOrder: r.sort_order, isActive: r.is_active, guidelines: r.guidelines,
      maxImages: r.max_images, parentSlug: r.parent_slug, attributeCount: r.attributes, productCount: r.products,
    }));
  }

  async category(id: string) {
    const all = await this.categories();
    const c = all.find((x) => x.id === id);
    if (!c) throw new NotFoundException('Category not found.');
    const attrs = await this.db.query<{ id: string; key: string; label: string; input_type: string; options: string[] | null; is_required: boolean; sort_order: number; used: number }>(
      `SELECT a.id, a.key, a.label, a.input_type, a.options, a.is_required, a.sort_order, (SELECT count(*)::int FROM product_attribute_values v WHERE v.attribute_id = a.id) AS used
       FROM category_attributes a WHERE a.category_id = $1 ORDER BY a.sort_order, a.label`, [id]);
    return { ...c, attributes: attrs.rows.map((a) => ({ id: a.id, key: a.key, label: a.label, inputType: a.input_type, options: a.options, required: a.is_required, sortOrder: a.sort_order, inUse: a.used > 0 })) };
  }

  async createCategory(adminId: string, dto: CreateCategoryDto) {
    let parentId: string | null = null;
    if (dto.parentSlug) {
      const p = await this.db.query<{ id: string; parent_id: string | null }>('SELECT id, parent_id FROM categories WHERE slug = $1', [dto.parentSlug]);
      if (!p.rows[0]) throw new BadRequestException('The parent category does not exist.');
      if (p.rows[0].parent_id) throw new BadRequestException('Only two levels are supported: a subcategory can’t have its own subcategories.');
      parentId = p.rows[0].id;
    }
    const wanted = dto.slug ?? slugify(dto.name, 50);
    if (dto.slug && (await this.db.query('SELECT 1 FROM categories WHERE slug = $1', [dto.slug])).rowCount) throw new ConflictException('That slug is already used by another category.');
    const slug = dto.slug ?? await uniqueSlug(wanted, async (s) => (await this.db.query('SELECT 1 FROM categories WHERE slug = $1', [s])).rowCount! > 0);
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO categories (parent_id, slug, name, description, icon, sort_order, guidelines, max_images) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [parentId, slug, dto.name, dto.description ?? null, dto.icon ?? null, dto.sortOrder ?? 0, dto.guidelines ?? null, dto.maxImages ?? null]);
    await this.audit.record(adminId, 'category.create', 'category', r.rows[0]!.id, { slug, name: dto.name, parent: dto.parentSlug ?? null });
    return this.category(r.rows[0]!.id);
  }

  async updateCategory(adminId: string, id: string, dto: UpdateCategoryDto) {
    const map: Record<string, string> = { name: 'name', description: 'description', icon: 'icon', sortOrder: 'sort_order', isActive: 'is_active', guidelines: 'guidelines', maxImages: 'max_images' };
    const sets: string[] = []; const vals: unknown[] = [id]; const changed: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(map)) {
      const v = (dto as Record<string, unknown>)[k];
      if (v === undefined) continue;
      vals.push(v === '' ? null : v); sets.push(`${col} = $${vals.length}`); changed[k] = v; // column names come from the fixed map
    }
    if (!sets.length) return this.category(id);
    const r = await this.db.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $1`, vals);
    if (!r.rowCount) throw new NotFoundException('Category not found.');
    await this.audit.record(adminId, dto.isActive === undefined ? 'category.update' : dto.isActive ? 'category.enable' : 'category.disable', 'category', id, changed);
    return this.category(id);
  }

  private checkAttr(inputType: string, options?: string[]) {
    if (inputType === 'select' && (!options || options.length < 2)) throw new BadRequestException('A choice field needs at least two options.');
    if (inputType !== 'select' && options?.length) throw new BadRequestException('Only choice fields have options.');
    if (options && new Set(options.map((o) => o.trim())).size !== options.length) throw new BadRequestException('Options must be different from each other.');
  }

  async addAttribute(adminId: string, categoryId: string, dto: AttributeDto) {
    if (!(await this.db.query('SELECT 1 FROM categories WHERE id = $1', [categoryId])).rowCount) throw new NotFoundException('Category not found.');
    this.checkAttr(dto.inputType, dto.options);
    try {
      await this.db.query(
        `INSERT INTO category_attributes (category_id, key, label, input_type, options, is_required, sort_order) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING id`,
        [categoryId, dto.key, dto.label, dto.inputType, dto.options ? JSON.stringify(dto.options.map((o) => o.trim())) : null, dto.required ?? false, dto.sortOrder ?? 0]);
      await this.audit.record(adminId, 'category.attribute_add', 'category', categoryId, { key: dto.key, inputType: dto.inputType, required: dto.required ?? false });
      return this.category(categoryId);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('This category already has a field with that key.');
      throw e;
    }
  }

  async updateAttribute(adminId: string, attributeId: string, dto: UpdateAttributeDto) {
    const cur = await this.db.query<{ category_id: string; input_type: string }>('SELECT category_id, input_type FROM category_attributes WHERE id = $1', [attributeId]);
    if (!cur.rows[0]) throw new NotFoundException('Field not found.');
    if (dto.options) this.checkAttr(cur.rows[0].input_type, dto.options);
    await this.db.query(
      `UPDATE category_attributes SET label = COALESCE($2, label), options = COALESCE($3::jsonb, options), is_required = COALESCE($4, is_required), sort_order = COALESCE($5, sort_order) WHERE id = $1`,
      [attributeId, dto.label ?? null, dto.options ? JSON.stringify(dto.options.map((o) => o.trim())) : null, dto.required ?? null, dto.sortOrder ?? null]);
    await this.audit.record(adminId, 'category.attribute_update', 'category', cur.rows[0].category_id, { attributeId, ...dto });
    return this.category(cur.rows[0].category_id);
  }

  /** A field that sellers have already filled in can't be deleted (that would silently erase their data): make it optional instead. */
  async deleteAttribute(adminId: string, attributeId: string) {
    const cur = await this.db.query<{ category_id: string; key: string; used: number }>(
      'SELECT a.category_id, a.key, (SELECT count(*)::int FROM product_attribute_values v WHERE v.attribute_id = a.id) AS used FROM category_attributes a WHERE a.id = $1', [attributeId]);
    if (!cur.rows[0]) throw new NotFoundException('Field not found.');
    if (cur.rows[0].used > 0) throw new ConflictException(`Sellers have filled in this field on ${cur.rows[0].used} listing(s). Make it optional instead of deleting it.`);
    await this.db.query('DELETE FROM category_attributes WHERE id = $1', [attributeId]);
    await this.audit.record(adminId, 'category.attribute_delete', 'category', cur.rows[0].category_id, { key: cur.rows[0].key });
    return this.category(cur.rows[0].category_id);
  }

  settingsList() { return this.settings.all(); }

  async updateSetting(adminId: string, key: string, value: unknown) {
    const { before, after } = await this.settings.set(key, value, adminId);
    const long = typeof after === 'string' && after.length > 200;
    // Long texts are logged by size, not content, to keep the audit trail readable.
    await this.audit.record(adminId, 'settings.update', 'setting', key, long ? { length: (after as string).length } : { before, after });
    if (key === 'site_logo_path' && typeof before === 'string' && before && before !== after) {
      await this.storage.deletePublic(before);
    }
    return (await this.settings.all()).find((s) => s.key === key);
  }

  async uploadSiteLogo(adminId: string, file: Express.Multer.File | undefined) {
    const [maxBytes, allowed] = await Promise.all([
      this.settings.get('max_image_bytes'),
      this.settings.get('allowed_image_types'),
    ]);
    const processed = await this.images.processBrandLogo(assertUpload(file, maxBytes), allowed);
    const key = `branding/logo/${randomUUID()}.webp`;
    const storedKey = await this.storage.putPublic(key, processed, 'image/webp');
    try {
      const { before } = await this.settings.set('site_logo_path', storedKey, adminId);
      await this.audit.record(adminId, 'settings.update', 'setting', 'site_logo_path', { changed: true });
      await this.storage.deletePublic(typeof before === 'string' ? before : undefined);
    } catch (error) {
      await this.storage.deletePublic(storedKey);
      throw error;
    }
    return (await this.settings.all()).find((s) => s.key === 'site_logo_path');
  }
}
