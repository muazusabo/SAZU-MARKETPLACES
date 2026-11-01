import { ApiError, apiFetch, apiFetchPage, PageMeta } from './api';

export interface ProductCardData {
  id: string; slug: string; title: string; priceKobo: number; productType: string; condition: string | null;
  availability: string; status: string; campusLocation: string | null; publishedAt: string | null;
  reviewCount?: number; averageRating?: number;
  category: { slug: string; name: string };
  seller: { slug: string; shopName: string; verified: boolean };
  image: { url: string; alt: string; fallbackUrl?: string | null } | null;
}
export interface ProductDetail {
  id: string; slug: string; title: string; description: string; priceKobo: number; productType: string;
  condition: string | null; availability: string; campusLocation: string | null; collectionInfo: string | null;
  publishedAt: string; updatedAt: string; viewCount: number;
  reviews?: { count: number; averageRating: number; items: ProductReview[] };
  category: { slug: string; name: string }; parentCategory: { slug: string; name: string } | null;
  images: { url: string; thumbUrl?: string; alt: string }[];
  specifications: { label: string; value: string; type: string }[];
  seller: { id: string; slug: string; shopName: string; description: string | null; location: string | null; verified: boolean; avatarUrl: string | null; activeSince?: string | null; activityStatus?: 'today' | 'recently' | null };
  canContact: { allowed: boolean; reason: string | null };
}
export interface ProductReview { id: string; rating: number; body: string; createdAt: string; author: string }
export interface CategoryNode {
  slug: string; name: string; description: string | null; icon: string | null; productCount: number; children: CategoryNode[];
}
export interface Storefront {
  id: string; slug: string; shopName: string; description: string | null; location: string | null; avatarUrl: string | null;
  verified: boolean; memberSince: string | null; activityStatus?: 'today' | 'recently' | null; activeProductCount: number; categories: { slug: string; name: string }[];
}

const REVALIDATE = { next: { revalidate: 30 } } as const;

export async function fetchProducts(query: string): Promise<{ items: ProductCardData[]; meta: PageMeta }> {
  const r = await apiFetchPage<ProductCardData[]>(`/products?${query}`, REVALIDATE);
  return { items: r.data, meta: r.meta };
}
export const fetchCategories = () => apiFetch<CategoryNode[]>('/categories', REVALIDATE);

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}
export const fetchProduct = (slug: string) => orNull(apiFetch<ProductDetail>(`/products/${encodeURIComponent(slug)}`, REVALIDATE));
export const fetchStorefront = (slug: string) => orNull(apiFetch<Storefront>(`/sellers/${encodeURIComponent(slug)}`, REVALIDATE));
export const fetchSitemap = () =>
  apiFetch<{ products: { slug: string; updatedAt: string }[]; sellers: { slug: string; updatedAt: string }[] }>('/sitemap', { next: { revalidate: 300 } });
