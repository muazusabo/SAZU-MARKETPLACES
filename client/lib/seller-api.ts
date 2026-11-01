import { PageMeta } from './api';
import { authedFetch, jsonBody } from './auth-client';
import type { ProductDetail } from './marketplace';

export interface SellerMe {
  id: string; slug: string; shopName: string; description: string | null; preferredCampusArea: string | null;
  publicLocation: string | null; contactPreferences: string | null; avatarUrl: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'; reviewNote: string | null; verified: boolean;
  categories: { slug: string; name: string }[];
}
export interface OwnListingRow {
  id: string; slug: string; title: string; priceKobo: number; status: string; availability: string; productType: string;
  rejectionReason: string | null; publishedAt: string | null; updatedAt: string; category: string; imageUrl: string | null; views30d: number; saves: number;
}
export interface OwnImage { id: string; url: string; thumbUrl: string; alt: string; sortOrder: number }
export interface OwnListing extends Omit<ProductDetail, 'images'> {
  id: string; status: string; rejectionReason: string | null; attributeValues: Record<string, string>; images: OwnImage[];
}
export interface DashboardData {
  unreadMessages: number;
  counts: { active: number; pendingReview: number; sold: number; unavailable: number; draft: number; rejected: number; archived: number };
  views30d: number; topListings: { id: string; slug: string; title: string; views: number }[];
}
export interface ShopInput {
  shopName?: string; description?: string | null; categorySlugs?: string[]; preferredCampusArea?: string | null;
  publicLocation?: string | null; contactPreferences?: string | null;
}

const form = (file: File, altText?: string) => { const f = new FormData(); f.append('file', file); if (altText) f.append('altText', altText); return f; };

export const sellerApi = {
  me: () => authedFetch<SellerMe | null>('/sellers/me'),
  apply: (body: ShopInput & { saveAsDraft?: boolean }) => authedFetch<SellerMe>('/sellers/apply', jsonBody('POST', body)),
  update: (body: ShopInput) => authedFetch<SellerMe>('/sellers/me', jsonBody('PATCH', body)),
  submitApplication: () => authedFetch<SellerMe>('/sellers/me/submit', jsonBody('POST')),
  shopAvatar: (file: File) => authedFetch<SellerMe>('/sellers/me/avatar', { method: 'POST', body: form(file) }),

  dashboard: () => authedFetch<DashboardData>('/seller/dashboard'),
  list: async (status: string, page: number) => {
    const r = await authedFetch<{ data: OwnListingRow[]; meta: PageMeta }>(`/seller/products?status=${status}&page=${page}&pageSize=10`);
    return r;
  },
  get: (id: string) => authedFetch<OwnListing>(`/seller/products/${id}`),
  create: (body: object) => authedFetch<OwnListing>('/products', jsonBody('POST', body)),
  updateListing: (id: string, body: object) => authedFetch<OwnListing>(`/products/${id}`, jsonBody('PATCH', body)),
  remove: (id: string) => authedFetch<null>(`/products/${id}`, jsonBody('DELETE')),
  action: (id: string, name: 'submit' | 'mark-sold' | 'mark-unavailable' | 'mark-available' | 'mark-reserved' | 'archive' | 'restore') =>
    authedFetch<OwnListing>(`/products/${id}/${name}`, jsonBody('POST')),

  uploadImage: (id: string, file: File) => authedFetch<OwnImage>(`/products/${id}/images`, { method: 'POST', body: form(file) }),
  deleteImage: (id: string, imageId: string) => authedFetch<null>(`/products/${id}/images/${imageId}`, jsonBody('DELETE')),
  reorderImages: (id: string, imageIds: string[]) => authedFetch<OwnImage[]>(`/products/${id}/images/order`, jsonBody('PUT', { imageIds })),
  imageAlt: (id: string, imageId: string, altText: string | null) => authedFetch<OwnImage[]>(`/products/${id}/images/${imageId}`, jsonBody('PATCH', { altText })),
};
