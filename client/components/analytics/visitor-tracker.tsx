'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { jsonBody } from '@/lib/auth-client';

const VISITOR_KEY = 'sazu-marketplace:analytics-visitor:v1';
const HEARTBEAT_INTERVAL = 60_000;

function getVisitorId(): string | null {
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY);
    if (stored) return stored;

    const visitorId = window.crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, visitorId);
    return visitorId;
  } catch (error) {
    console.warn('Marketplace visit analytics could not access browser storage.', error);
    return null;
  }
}

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;

    const sendHeartbeat = () => {
      void apiFetch<null>('/analytics/visitors/heartbeat', jsonBody('POST', { visitorId }))
        .catch((error: unknown) => console.warn('Marketplace visit analytics heartbeat failed.', error));
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => window.clearInterval(interval);
  }, [pathname]);

  return null;
}
