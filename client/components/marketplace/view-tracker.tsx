'use client';
import { useEffect } from 'react';
import { apiBaseUrl } from '@/lib/api';

/** Records one anonymous view. The server de-duplicates per viewer per hour. Failures are silent by design. */
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`${apiBaseUrl()}/products/${encodeURIComponent(slug)}/views`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [slug]);
  return null;
}
