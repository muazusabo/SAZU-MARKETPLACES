'use client';
import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

type RequestEvent = { id: string; stage: 'start' | 'slow' | 'end' };

export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [slowRequests, setSlowRequests] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onRequest = (event: Event) => {
      const { id, stage } = (event as CustomEvent<RequestEvent>).detail;
      setSlowRequests((current) => {
        const next = new Set(current);
        if (stage === 'slow') next.add(id);
        if (stage === 'end') next.delete(id);
        return next;
      });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('sazu:request', onRequest);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('sazu:request', onRequest);
    };
  }, []);

  if (online && slowRequests.size === 0) return null;
  return (
    <div
      role={online ? 'status' : 'alert'}
      aria-live={online ? 'polite' : 'assertive'}
      className="fixed inset-x-0 top-0 z-[60] text-center text-sm font-medium"
    >
      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground">
          <WifiOff aria-hidden className="size-4" />
          <span>You’re offline. Listing, shop, and profile drafts are saved on this device when browser storage is available; reconnect to continue.</span>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-primary px-4 py-2 text-primary-foreground">
          <div aria-hidden className="network-progress absolute inset-y-0 left-0 w-1/3 bg-accent/40" />
          <span className="relative inline-flex items-center gap-2">
            <Wifi aria-hidden className="size-4" />
            {slowRequests.size > 1 ? 'The connection is slow. Requests are still in progress…' : 'The connection is slow. Still working…'}
          </span>
          <span role="progressbar" aria-label="Request in progress" className="sr-only" />
        </div>
      )}
    </div>
  );
}
