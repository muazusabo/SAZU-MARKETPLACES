import { z } from 'zod';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the server enforces its own (configurable) limit
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** "12,500.50" -> 1250050 kobo, using string maths so there is no floating-point drift. Null if invalid or under ₦1. */
export function nairaStringToKobo(input: string): number | null {
  const s = input.replace(/[,\s₦]/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const kobo = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return kobo >= 100 ? kobo : null;
}
export const koboToNairaString = (kobo: number) => (kobo % 100 === 0 ? String(kobo / 100) : (kobo / 100).toFixed(2));

export const listingSchema = z.object({
  title: z.string().trim().min(3, 'Give your listing a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  description: z.string().trim().min(10, 'Describe the item in at least 10 characters.').max(5000, 'Keep the description under 5,000 characters.'),
  categorySlug: z.string().min(1, 'Choose a category.'),
  productType: z.enum(['product', 'service']),
  priceNaira: z.string().refine((v) => nairaStringToKobo(v) !== null, 'Enter a price of at least ₦1 (up to 2 decimal places).'),
  condition: z.string(),
  campusLocation: z.string().trim().max(80, 'Keep it under 80 characters.'),
  collectionInfo: z.string().trim().max(300, 'Keep it under 300 characters.'),
  attributes: z.record(z.string(), z.string().max(500, 'Keep it under 500 characters.')),
});
export type ListingValues = z.infer<typeof listingSchema>;

export function listingToPayload(v: ListingValues, allowedAttributeKeys: string[]) {
  const attributes = Object.fromEntries(Object.entries(v.attributes).filter(([k, val]) => allowedAttributeKeys.includes(k) && val.trim() !== ''));
  return {
    title: v.title, description: v.description, categorySlug: v.categorySlug, productType: v.productType,
    priceKobo: nairaStringToKobo(v.priceNaira)!,
    condition: v.productType === 'service' || !v.condition ? null : v.condition,
    campusLocation: v.campusLocation || null, collectionInfo: v.collectionInfo || null, attributes,
  };
}

/** Quick client-side check for a friendlier message. The server re-validates the file content. */
export function validateImageFile(file: { name: string; type: string; size: number }, maxBytes = MAX_IMAGE_BYTES): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return `${file.name}: use a JPEG, PNG or WebP image.`;
  if (file.size > maxBytes) return `${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
