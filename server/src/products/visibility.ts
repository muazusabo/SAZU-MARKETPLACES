/**
 * The single definition of "publicly visible". Requires aliases:
 * p = products, s = seller_profiles, pc = the product's category, ppc = pc's parent category.
 * Public endpoints must always include this so unreviewed, expired, or suspended-seller listings never leak.
 */
export const VISIBLE_PRODUCT_SQL = `
  p.status = 'published'
  AND s.status IN ('approved', 'pending')
  AND pc.is_active AND (ppc.id IS NULL OR ppc.is_active)
  AND (p.expires_at IS NULL OR p.expires_at > now())`;

export const PRODUCT_FROM_SQL = `
  FROM products p
  JOIN seller_profiles s ON s.id = p.seller_id
  JOIN categories pc ON pc.id = p.category_id
  LEFT JOIN categories ppc ON ppc.id = pc.parent_id`;
