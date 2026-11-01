import { apiFetch } from './api';

export type PublicContent = Partial<Record<'community_guidelines' | 'terms_text' | 'privacy_text' | 'about_text' | 'support_email' | 'support_phone' | 'site_logo_url', string>>;

export const fetchPublicContent = () => apiFetch<PublicContent>('/settings/public', { next: { revalidate: 60 } });
export const fetchFreshPublicContent = () => apiFetch<PublicContent>('/settings/public', { cache: 'no-store' });

/** Only well-formed values become links. */
export const safeEmail = (v?: string) => (v && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v.trim()) ? v.trim() : null);
export const safePhone = (v?: string) => (v && /^[+\d][\d\s\-()]{5,24}$/.test(v.trim()) ? v.trim() : null);
export const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
