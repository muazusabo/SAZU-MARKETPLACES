import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { VISIBLE_PRODUCT_SQL } from '../products/visibility';

export interface CategoryNode {
  slug: string; name: string; description: string | null; icon: string | null;
  productCount: number; children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly db: DatabaseService) {}

  /** Active categories as a tree. Counts include only publicly visible listings. */
  async tree(): Promise<CategoryNode[]> {
    const { rows } = await this.db.query<{
      id: string; parent_id: string | null; slug: string; name: string; description: string | null; icon: string | null; n: number;
    }>(
      `SELECT c.id, c.parent_id, c.slug, c.name, c.description, c.icon,
              (SELECT count(*)::int FROM products p
                 JOIN seller_profiles s ON s.id = p.seller_id
                 JOIN categories pc ON pc.id = p.category_id
                 LEFT JOIN categories ppc ON ppc.id = pc.parent_id
                WHERE p.category_id = c.id AND ${VISIBLE_PRODUCT_SQL}) AS n
       FROM categories c
       LEFT JOIN categories par ON par.id = c.parent_id
       WHERE c.is_active AND (c.parent_id IS NULL OR par.is_active)
       ORDER BY c.sort_order, c.name`,
    );
    const nodes = new Map<string, CategoryNode & { id: string }>();
    for (const r of rows) nodes.set(r.id, { id: r.id, slug: r.slug, name: r.name, description: r.description, icon: r.icon, productCount: r.n, children: [] });
    const roots: CategoryNode[] = [];
    for (const r of rows) {
      const node = nodes.get(r.id)!;
      const parent = r.parent_id ? nodes.get(r.parent_id) : undefined;
      if (parent) { parent.children.push(node); parent.productCount += node.productCount; } else roots.push(node);
    }
    const strip = (n: CategoryNode & { id?: string }): CategoryNode => { delete n.id; n.children.forEach(strip); return n; };
    return roots.map(strip);
  }

  async bySlug(slug: string) {
    const { rows } = await this.db.query<{
      id: string; slug: string; name: string; description: string | null; icon: string | null; guidelines: string | null; max_images: number | null;
      parent_slug: string | null; parent_name: string | null;
    }>(
      `SELECT c.id, c.slug, c.name, c.description, c.icon, c.guidelines, c.max_images, par.slug AS parent_slug, par.name AS parent_name
       FROM categories c LEFT JOIN categories par ON par.id = c.parent_id
       WHERE c.slug = $1 AND c.is_active AND (par.id IS NULL OR par.is_active)`,
      [slug],
    );
    const c = rows[0];
    if (!c) throw new NotFoundException('Category not found.');
    const [children, attrs] = await Promise.all([
      this.db.query<{ slug: string; name: string }>(
        'SELECT slug, name FROM categories WHERE parent_id = $1 AND is_active ORDER BY sort_order, name', [c.id]),
      this.db.query<{ key: string; label: string; input_type: string; options: unknown; is_required: boolean }>(
        `SELECT key, label, input_type, options, is_required FROM category_attributes
         WHERE category_id = $1 OR category_id = (SELECT parent_id FROM categories WHERE id = $1)
         ORDER BY sort_order`, [c.id]),
    ]);
    return {
      slug: c.slug, name: c.name, description: c.description, icon: c.icon, guidelines: c.guidelines, maxImages: c.max_images,
      parent: c.parent_slug ? { slug: c.parent_slug, name: c.parent_name } : null,
      children: children.rows,
      attributes: attrs.rows.map((a) => ({ key: a.key, label: a.label, inputType: a.input_type, options: a.options, required: a.is_required })),
    };
  }
}
