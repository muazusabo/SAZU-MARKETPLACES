import { PageMeta } from './api';
import { authedFetch, jsonBody } from './auth-client';
import type { ProductDetail } from './marketplace';

type Paged<T> = { data: T[]; meta: PageMeta };
const qs = (o: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

export interface Overview {
  metrics: { totalUsers: number; uniqueVisitors: number; onlineVisitors: number; approvedSellers: number; pendingSellerApplications: number; activeListings: number; pendingListingReviews: number; reportedProducts: number; openReports: number };
  recentActivity: { id: string; action: string; resourceType: string | null; resourceId: string | null; actor: string | null; createdAt: string }[];
}
export interface AdminSeller {
  id: string; slug: string; shopName: string; description: string | null; status: string; reviewNote: string | null; submittedAt: string | null; verified: boolean;
  categories: string[]; user: { id: string; email: string; emailVerified: boolean; displayName: string };
}
export interface AdminListingRow {
  id: string; slug: string; title: string; priceKobo: number; status: string; availability: string; updatedAt: string; category: string;
  seller: { id: string; slug: string; shopName: string }; imageUrl: string | null; openReports: number;
}
export interface HistoryItem { id: string; action: string; reason: string | null; moderator: string | null; createdAt: string }
export interface AdminListing extends Omit<ProductDetail, 'images'> {
  status: string; rejectionReason: string | null; sellerStatus: string; sellerUserId: string; openReports: number;
  images: { url: string; thumbUrl: string; alt: string }[]; history: HistoryItem[];
}
export interface AdminReport {
  id: string; targetType: 'product' | 'seller' | 'user' | 'conversation'; targetId: string; targetLabel: string; productSlug: string | null; sellerSlug: string | null;
  reason: string; status: string; createdAt: string; resolvedAt: string | null; reporter: string; reportsOnTarget: number; details: string | null; resolutionNote: string | null;
  conversation?: { id: string; body: string; createdAt: string; role: string; name: string }[] | null; history?: HistoryItem[];
}
export interface AdminUserRow { id: string; email: string; displayName: string; status: string; roles: string[]; emailVerified: boolean; sellerStatus: string | null; studentVerification: string; createdAt: string; lastLoginAt: string | null }
export interface AdminUser {
  id: string; email: string; emailVerified: boolean; status: string; roles: string[]; createdAt: string; lastLoginAt: string | null;
  profile: { fullName: string; displayName: string; phone: string | null; campusArea: string | null; studentVerification: string };
  seller: { id: string; shopName: string; status: string; slug: string; listings: number } | null;
  activity: { reportsFiled: number; reportsAgainst: number }; history: HistoryItem[];
}
export interface AdminAttribute { id: string; key: string; label: string; inputType: string; options: string[] | null; required: boolean; sortOrder: number; inUse: boolean }
export interface AdminCategory {
  id: string; slug: string; name: string; description: string | null; icon: string | null; sortOrder: number; isActive: boolean; guidelines: string | null;
  maxImages: number | null; parentSlug: string | null; attributeCount: number; productCount: number; attributes?: AdminAttribute[];
}
export interface AdminSetting { key: string; type: 'boolean' | 'int' | 'text' | 'image' | 'imageTypes'; group: string; label: string; min?: number; max?: number; maxLength?: number; value: unknown; updatedAt: string | null }
export interface AuditEntry { id: string; action: string; resourceType: string | null; resourceId: string | null; metadata: Record<string, unknown>; actor: string | null; createdAt: string }

export const adminApi = {
  overview: () => authedFetch<Overview>('/admin/overview'),
  applications: (status: string, page: number) => authedFetch<Paged<AdminSeller>>(`/admin/sellers/applications${qs({ status, page, pageSize: 10 })}`),
  reviewSeller: (id: string, decision: string, note?: string) => authedFetch<{ status: string }>(`/admin/sellers/${id}/review`, jsonBody('PATCH', { decision, note })),
  setVerified: (id: string, verified: boolean) => authedFetch<{ verified: boolean }>(`/admin/sellers/${id}/verified`, jsonBody('PATCH', { verified })),

  listings: (status: string, q: string, page: number) => authedFetch<Paged<AdminListingRow>>(`/admin/products${qs({ status, q, page, pageSize: 10 })}`),
  listing: (id: string) => authedFetch<AdminListing>(`/admin/products/${id}`),
  reviewListing: (id: string, decision: string, reason?: string) => authedFetch<AdminListing>(`/admin/products/${id}/review`, jsonBody('PATCH', { decision, reason })),

  reports: (status: string, targetType: string, page: number) => authedFetch<Paged<AdminReport>>(`/admin/reports${qs({ status, targetType, page, pageSize: 10 })}`),
  report: (id: string) => authedFetch<AdminReport>(`/admin/reports/${id}`),
  updateReport: (id: string, status: string, note?: string) => authedFetch<AdminReport>(`/admin/reports/${id}`, jsonBody('PATCH', { status, note })),

  users: (q: string, status: string, role: string, page: number) => authedFetch<Paged<AdminUserRow>>(`/admin/users${qs({ q, status, role, page, pageSize: 15 })}`),
  user: (id: string) => authedFetch<AdminUser>(`/admin/users/${id}`),
  setUserStatus: (id: string, status: string, reason?: string) => authedFetch<AdminUser>(`/admin/users/${id}/status`, jsonBody('PATCH', { status, reason })),
  grantModerator: (id: string) => authedFetch<AdminUser>(`/admin/users/${id}/roles`, jsonBody('POST', { role: 'moderator' })),
  revokeModerator: (id: string) => authedFetch<AdminUser>(`/admin/users/${id}/roles/moderator`, jsonBody('DELETE')),
  studentVerification: (id: string, status: string) => authedFetch<AdminUser>(`/admin/users/${id}/student-verification`, jsonBody('PATCH', { status })),

  categories: () => authedFetch<AdminCategory[]>('/admin/categories'),
  category: (id: string) => authedFetch<AdminCategory>(`/admin/categories/${id}`),
  createCategory: (body: object) => authedFetch<AdminCategory>('/admin/categories', jsonBody('POST', body)),
  updateCategory: (id: string, body: object) => authedFetch<AdminCategory>(`/admin/categories/${id}`, jsonBody('PATCH', body)),
  addAttribute: (id: string, body: object) => authedFetch<AdminCategory>(`/admin/categories/${id}/attributes`, jsonBody('POST', body)),
  updateAttribute: (id: string, body: object) => authedFetch<AdminCategory>(`/admin/categories/attributes/${id}`, jsonBody('PATCH', body)),
  deleteAttribute: (id: string) => authedFetch<AdminCategory>(`/admin/categories/attributes/${id}`, jsonBody('DELETE')),

  settings: () => authedFetch<AdminSetting[]>('/admin/settings'),
  updateSetting: (key: string, value: unknown) => authedFetch<AdminSetting>(`/admin/settings/${key}`, jsonBody('PATCH', { value })),
  uploadSiteLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return authedFetch<AdminSetting>('/admin/settings/site-logo', { method: 'POST', body: form });
  },
  audit: (action: string, page: number) => authedFetch<Paged<AuditEntry>>(`/admin/audit-logs${qs({ action, page, pageSize: 25 })}`),
};
