import { PageMeta } from './api';
import { authedFetch, jsonBody } from './auth-client';

export type ListingState = 'available' | 'reserved' | 'sold' | 'unavailable' | 'removed';

export interface WishlistItem {
  id: string; slug: string; title: string; priceKobo: number; category: string; sellerName: string;
  imageUrl: string | null; savedAt: string; state: ListingState; href: string | null;
}
export interface ConversationSummary {
  id: string; role: 'buyer' | 'seller'; createdAt: string; lastMessageAt: string | null;
  counterpart: { name: string; avatarUrl: string | null };
  product: { slug: string; title: string; priceKobo: number; imageUrl: string | null; state: ListingState; href: string | null } | null;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  unreadCount: number; blockedByMe: boolean; canSend: boolean;
}
export interface ChatMessage { id: string; mine: boolean; body: string; createdAt: string; read?: boolean | null }
export interface AppNotification { id: string; type: string; title: string; body: string | null; link: string | null; data: Record<string, unknown>; read: boolean; createdAt: string }
export interface MessagePage { data: ChatMessage[]; meta: { hasMore: boolean; nextBefore: string | null } }

export const buyerApi = {
  wishlistIds: () => authedFetch<string[]>('/wishlist/ids'),
  wishlist: (page: number) => authedFetch<{ data: WishlistItem[]; meta: PageMeta }>(`/wishlist?page=${page}&pageSize=12`),
  save: (id: string) => authedFetch<null>(`/wishlist/${id}`, jsonBody('POST')),
  unsave: (id: string) => authedFetch<null>(`/wishlist/${id}`, jsonBody('DELETE')),

  startConversation: (productId: string, interested: boolean) =>
    authedFetch<{ id: string; created: boolean; productSlug: string }>('/conversations', jsonBody('POST', { productId, interested })),
  conversations: () => authedFetch<{ data: ConversationSummary[]; meta: PageMeta }>('/conversations?pageSize=50'),
  conversation: (id: string) => authedFetch<ConversationSummary>(`/conversations/${id}`),
  messages: (id: string, before?: string) => authedFetch<MessagePage>(`/conversations/${id}/messages?limit=30${before ? `&before=${before}` : ''}`),
  send: (id: string, body: string) => authedFetch<ChatMessage>(`/conversations/${id}/messages`, jsonBody('POST', { body })),
  markRead: (id: string) => authedFetch<{ unreadMessages: number }>(`/conversations/${id}/read`, jsonBody('POST')),
  block: (id: string) => authedFetch<null>(`/conversations/${id}/block`, jsonBody('POST')),
  unblock: (id: string) => authedFetch<null>(`/conversations/${id}/block`, jsonBody('DELETE')),
  unreadMessages: () => authedFetch<{ count: number }>('/conversations/unread-count'),

  notifications: (page: number) => authedFetch<{ data: AppNotification[]; meta: PageMeta & { unreadCount: number } }>(`/notifications?page=${page}&pageSize=20`),
  unreadNotifications: () => authedFetch<{ count: number }>('/notifications/unread-count'),
  readNotification: (id: string) => authedFetch<null>(`/notifications/${id}/read`, jsonBody('PATCH')),
  readAllNotifications: () => authedFetch<null>('/notifications/read-all', jsonBody('POST')),

  report: (body: { targetType: 'product' | 'seller' | 'user' | 'conversation'; targetId: string; reason: string; details?: string }) =>
    authedFetch<{ id: string; status: string }>('/reports', jsonBody('POST', body)),
};
