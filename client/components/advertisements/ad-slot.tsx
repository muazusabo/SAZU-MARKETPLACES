'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { apiBaseUrl, apiFetch } from '@/lib/api';

type Placement = 'home_banner' | 'sponsored_product' | 'browse_banner' | 'category_banner';
type PublicAd = { id: string; title: string; advertiserName: string; description: string; imageUrl: string | null };

function sessionVisitorId(): string | null {
  try {
    let id = sessionStorage.getItem('sazu-ad-session');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('sazu-ad-session', id); }
    return id;
  } catch { return null; }
}

function recordVisibleImpression(id: string) {
  const visitorId = sessionVisitorId();
  if (!visitorId) return;
  try {
    const key = 'sazu-ad-impressions';
    const seen: string[] = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    if (seen.includes(id)) return;
    sessionStorage.setItem(key, JSON.stringify([...seen, id]));
    void fetch(`${apiBaseUrl()}/advertisements/${id}/impressions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId }), keepalive: true,
    }).catch(() => undefined);
  } catch { /* Storage can be unavailable in private browsing; don't affect ad display. */ }
}

export function AdSlot({ placement, category, className = '' }: { placement: Placement; category?: string; className?: string }) {
  const [ads, setAds] = useState<PublicAd[]>([]);
  const slotRef = useRef<HTMLDivElement>(null);
  const query = new URLSearchParams({ placement });
  if (category) query.set('category', category);

  useEffect(() => {
    let current = true;
    apiFetch<PublicAd[]>(`/advertisements?${query.toString()}`, { timeoutMs: 4000 })
      .then((results) => { if (current) setAds(results); })
      .catch(() => { if (current) setAds([]); });
    return () => { current = false; };
  // The query string is stable for the selected placement and category.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, category]);

  useEffect(() => {
    const root = slotRef.current;
    if (!root || ads.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const id = (entry.target as HTMLElement).dataset.adId;
          if (id) { recordVisibleImpression(id); observer.unobserve(entry.target); }
        }
      }
    }, { threshold: 0.5 });
    root.querySelectorAll<HTMLElement>('[data-ad-id]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ads]);

  if (!ads.length) return null;
  const endpoint = apiBaseUrl();
  const productPlacement = placement === 'sponsored_product';
  return (
    <div ref={slotRef} role="region" aria-label="Sponsored advertisements" className={`${productPlacement ? 'grid grid-cols-2 gap-3 min-[480px]:gap-4 lg:grid-cols-3 xl:grid-cols-4' : 'grid gap-3'} ${className}`}>
      {ads.map((ad) => (
        <article key={ad.id} data-ad-id={ad.id} className={`ad-slot-enter overflow-hidden rounded-2xl border border-brand-light-lime bg-brand-cream shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none ${productPlacement ? 'h-full' : ''}`}>
          <Link href={`${endpoint}/advertisements/${ad.id}/click`} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" aria-label={`Sponsored by ${ad.advertiserName}: ${ad.title}`}>
            {ad.imageUrl && (
              <div className={productPlacement ? 'relative aspect-[4/3] overflow-hidden bg-secondary' : 'relative aspect-[2.8/1] overflow-hidden bg-secondary sm:aspect-[4.5/1]'}>
                <Image src={ad.imageUrl} alt="" fill unoptimized sizes="(max-width: 768px) 100vw, 1200px" className="object-cover transition-transform duration-300 group-hover:scale-[1.015]" />
                <span className="absolute left-3 top-3 rounded-full bg-brand-deep/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Sponsored</span>
              </div>
            )}
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5">
              <div className="min-w-0">
                {!ad.imageUrl && <span className="mb-2 inline-flex rounded-full bg-brand-light-lime px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Sponsored</span>}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ad.advertiserName}</p>
                <h2 className={`mt-1 font-display font-bold group-hover:text-primary ${productPlacement ? 'line-clamp-2 text-base' : 'text-lg sm:text-xl'}`}>{ad.title}</h2>
                <p className={`mt-1 text-sm leading-relaxed text-muted-foreground ${productPlacement ? 'line-clamp-3' : 'max-w-3xl'}`}>{ad.description}</p>
              </div>
              {!productPlacement && <span className="shrink-0 self-end text-sm font-bold text-primary">Advertisement <span aria-hidden>↗</span></span>}
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
