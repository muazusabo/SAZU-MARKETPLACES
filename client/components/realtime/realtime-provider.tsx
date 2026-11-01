'use client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/components/auth/auth-provider';
import { apiBaseUrl } from '@/lib/api';
import { getAccessToken, refreshAccessToken } from '@/lib/auth-client';
import { buyerApi } from '@/lib/buyer-api';

interface RealtimeValue { connected: boolean; unreadMessages: number; unreadNotifications: number; refreshCounts(): Promise<void> }
const RealtimeContext = createContext<RealtimeValue | null>(null);

/**
 * Keeps one authenticated WebSocket open while signed in. The server only pushes (new messages, notifications, read receipts);
 * everything the user does still goes through the REST API. If the socket is down, pages fall back to polling.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const refreshCounts = useCallback(async () => {
    try {
      const [m, n] = await Promise.all([buyerApi.unreadMessages(), buyerApi.unreadNotifications()]);
      setUnreadMessages(m.count); setUnreadNotifications(n.count);
    } catch { /* counts are best-effort */ }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') { setUnreadMessages(0); setUnreadNotifications(0); setConnected(false); return; }
    let closed = false; let attempts = 0; let retry: ReturnType<typeof setTimeout> | undefined;
    void refreshCounts();

    const socket = io(new URL(apiBaseUrl()).origin, {
      path: '/socket.io', transports: ['websocket', 'polling'], reconnectionDelay: 1000, reconnectionDelayMax: 15000,
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    });
    // The server closes a socket the moment its access token expires (or rejects a stale one): refresh, then reconnect with backoff.
    const reauth = () => {
      if (closed || attempts >= 6) return;
      socket.disconnect();
      retry = setTimeout(async () => { attempts++; if (await refreshAccessToken()) { if (!closed) socket.connect(); } }, Math.min(30_000, 500 * 2 ** attempts));
    };

    socket.on('ready', () => { attempts = 0; setConnected(true); void refreshCounts(); });
    socket.on('disconnect', (reason) => { setConnected(false); if (reason === 'io server disconnect') reauth(); });
    socket.on('auth_error', (p: { reason?: string }) => { if (p?.reason !== 'too_many_connections') reauth(); });
    socket.on('message:new', (p: { conversationId: string; message: { mine: boolean } }) => {
      if (!p.message.mine) setUnreadMessages((c) => c + 1);
      void qc.invalidateQueries({ queryKey: ['messages', p.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversation', p.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('conversation:read', (p: { conversationId: string }) => { void qc.invalidateQueries({ queryKey: ['messages', p.conversationId] }); });
    socket.on('notification:new', () => { setUnreadNotifications((c) => c + 1); void qc.invalidateQueries({ queryKey: ['notifications'] }); });

    const onFocus = () => void refreshCounts();
    window.addEventListener('focus', onFocus);
    return () => { closed = true; clearTimeout(retry); window.removeEventListener('focus', onFocus); socket.removeAllListeners(); socket.disconnect(); };
  }, [status, qc, refreshCounts]);

  const value = useMemo(() => ({ connected, unreadMessages, unreadNotifications, refreshCounts }), [connected, unreadMessages, unreadNotifications, refreshCounts]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
