'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, ImageOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { ListingState, WishlistItem, buyerApi } from '@/lib/buyer-api';
import { formatNairaFromKobo } from '@/lib/format';
import { useWishlist } from './wishlist-provider';

const STATE_COPY: Record<ListingState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'default'; note?: string }> = {
  available: { label: 'Available', variant: 'success' },
  reserved: { label: 'Reserved', variant: 'warning', note: 'The seller is holding this for someone.' },
  sold: { label: 'Sold', variant: 'destructive', note: 'This item has been sold.' },
  unavailable: { label: 'Unavailable', variant: 'destructive', note: 'The seller has marked this unavailable.' },
  removed: { label: 'No longer listed', variant: 'destructive', note: 'This listing was removed or is no longer public.' },
};

function Row({ item, onRemove }: { item: WishlistItem; onRemove: (id: string) => void }) {
  const s = STATE_COPY[item.state];
  const dim = item.state !== 'available' && item.state !== 'reserved';
  return (
    <li className="flex min-w-0 gap-3 overflow-hidden rounded-lg border bg-card p-3">
      {item.imageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={item.imageUrl} alt="" className={`size-24 shrink-0 rounded-md bg-muted object-cover ${dim ? 'opacity-60' : ''}`} />
        : <span aria-hidden className="grid size-24 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImageOff /></span>}
      <div className="min-w-0 flex-1 break-words">
        <p className="flex flex-wrap items-center gap-2">
          {item.href ? <Link href={item.href} className="truncate font-bold hover:underline">{item.title}</Link> : <span className="truncate font-bold">{item.title}</span>}
          <Badge variant={s.variant}>{s.label}</Badge>
        </p>
        <p className="text-sm text-muted-foreground">{formatNairaFromKobo(item.priceKobo)} · {item.category} · {item.sellerName}</p>
        {s.note && <p role="status" className="mt-1 text-sm font-medium">{s.note}</p>}
        <Button type="button" size="sm" variant="ghost" className="mt-2 px-0 text-muted-foreground" onClick={() => onRemove(item.id)}>Remove from wishlist</Button>
      </div>
    </li>
  );
}

function Content() {
  const qc = useQueryClient();
  const { toggle } = useWishlist();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['wishlist', page], queryFn: () => buyerApi.wishlist(page) });

  async function remove(id: string) {
    // The provider keeps hearts elsewhere in sync (and reports errors); then refresh this list.
    await toggle(id);
    await qc.invalidateQueries({ queryKey: ['wishlist'] });
  }

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Heart aria-hidden className="size-7 text-destructive" />Your wishlist</h1>
      <p className="mt-1 text-muted-foreground">Only you can see this list.</p>
      <div className="mt-6">
        {q.isLoading ? <div role="status" aria-label="Loading wishlist" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          : q.isError ? <ErrorState message="We couldn’t load your wishlist." error={q.error} onRetry={() => { void q.refetch(); }} />
          : !q.data?.data.length ? <EmptyState title="Nothing saved yet" text="Tap the heart on any listing to keep it here for later." action={{ href: '/browse', label: 'Browse products' }} />
          : (
            <>
              <ul className="grid gap-3">{q.data.data.map((i) => <Row key={i.id} item={i} onRemove={remove} />)}</ul>
              {q.data.meta.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-sm text-muted-foreground" aria-live="polite">Page {q.data.meta.page} of {q.data.meta.totalPages}</span>
                  <Button variant="outline" disabled={page >= q.data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

export function WishlistPage() { return <RequireAuth><Content /></RequireAuth>; }
