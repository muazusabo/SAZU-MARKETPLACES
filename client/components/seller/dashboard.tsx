'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Pagination } from '@/components/marketplace/pagination';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatNairaFromKobo } from '@/lib/format';
import { OwnListingRow, sellerApi } from '@/lib/seller-api';
import { SellerGate } from './seller-gate';
import { ListingStatusBadge } from './status-badge';

const TABS = [
  ['all', 'All'], ['active', 'Live'], ['pending_review', 'In review'], ['draft', 'Drafts'], ['sold', 'Sold'],
  ['unavailable', 'Unavailable'], ['rejected', 'Rejected'], ['archived', 'Archived'],
] as const;

function RowActions({ row }: { row: OwnListingRow }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await Promise.all([qc.invalidateQueries({ queryKey: ['seller-listings'] }), qc.invalidateQueries({ queryKey: ['seller-dashboard'] })]); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not complete that. Try again.'); }
    finally { setBusy(false); }
  }
  const act = (name: Parameters<typeof sellerApi.action>[1], ok: string) => () => run(() => sellerApi.action(row.id, name), ok);
  const live = row.status === 'published';
  const canDelete = !row.publishedAt && ['draft', 'rejected', 'archived'].includes(row.status);
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.status !== 'removed' && row.status !== 'archived' && <Button asChild size="sm" variant="outline"><Link href={`/dashboard/listings/${row.id}/edit`}>Edit</Link></Button>}
      <Button asChild size="sm" variant="ghost"><Link href={`/dashboard/listings/${row.id}/preview`}>Preview</Link></Button>
      {live && <Button asChild size="sm" variant="ghost"><Link href={`/product/${row.slug}`}>View public page</Link></Button>}
      {live && row.availability !== 'sold' && <ConfirmButton size="sm" variant="outline" disabled={busy} confirmLabel="Mark as sold?" onConfirm={act('mark-sold', 'Marked as sold.')}>Mark sold</ConfirmButton>}
      {live && row.availability === 'available' && <Button size="sm" variant="ghost" disabled={busy} onClick={act('mark-unavailable', 'Marked unavailable.')}>Mark unavailable</Button>}
      {live && ['sold', 'unavailable', 'reserved'].includes(row.availability) && <Button size="sm" variant="ghost" disabled={busy} onClick={act('mark-available', 'Marked available.')}>Mark available</Button>}
      {row.status === 'archived' && <Button size="sm" variant="outline" disabled={busy} onClick={act('restore', 'Restored as a draft.')}>Restore</Button>}
      {['draft', 'pending_review', 'published', 'rejected'].includes(row.status) && <ConfirmButton size="sm" variant="ghost" disabled={busy} confirmLabel="Archive?" onConfirm={act('archive', 'Archived.')}>Archive</ConfirmButton>}
      {canDelete && <ConfirmButton size="sm" variant="ghost" disabled={busy} confirmLabel="Delete forever?" onConfirm={() => run(() => sellerApi.remove(row.id), 'Deleted.')}>Delete</ConfirmButton>}
    </div>
  );
}

function Content({ shopName, published, applicationSubmitted }: { shopName: string; published: boolean; applicationSubmitted: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [page, setPage] = useState(1);
  const stats = useQuery({ queryKey: ['seller-dashboard'], queryFn: sellerApi.dashboard });
  const list = useQuery({ queryKey: ['seller-listings', tab, page], queryFn: () => sellerApi.list(tab, page) });
  const c = stats.data?.counts;
  const cards: [string, number | undefined][] = [
    ['Unread messages', stats.data?.unreadMessages], ['Live', c?.active], ['In review', c?.pendingReview], ['Sold', c?.sold], ['Drafts', c?.draft], ['Rejected', c?.rejected], ['Archived', c?.archived], ['Views (30 days)', stats.data?.views30d],
  ];
  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Seller dashboard</p><h1 className="text-3xl font-bold">{shopName}</h1></div>
        <div className="grid w-full grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:w-auto">
          <Button asChild variant="outline" className="min-h-11"><Link href="/dashboard/settings">Shop settings</Link></Button>
          <Button asChild className="min-h-11"><Link href="/dashboard/listings/new"><Plus />New listing</Link></Button>
        </div>
      </div>

      {published && (
        <div role="status" className="mt-5 rounded-xl border border-success/30 bg-success/5 p-5">
          <h2 className="font-bold text-success">Your listing is live</h2>
          <p className="mt-1 text-sm text-muted-foreground">Buyers can now find it on SAZU Marketplace. Keep your details and availability up to date, and reply promptly to interested buyers.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href="/browse">Browse the marketplace</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/listings/new">Create another listing</Link></Button>
          </div>
        </div>
      )}
      {applicationSubmitted && (
        <div role="status" className="mt-5 rounded-xl border border-accent/40 bg-secondary p-5">
          <h2 className="font-bold">Your seller application has been submitted</h2>
          <p className="mt-1 text-sm text-muted-foreground">We’ll review your shop details. You can already create and publish listings while your application is under review.</p>
          <Button asChild size="sm" className="mt-3"><Link href="/dashboard/listings/new">Create a listing</Link></Button>
        </div>
      )}

      {stats.isError ? <div className="mt-6"><ErrorState message="We couldn’t load your numbers." error={stats.error} onRetry={() => { void stats.refetch(); }} /></div> : (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
          {cards.map(([label, n]) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">{label === 'Unread messages' ? <Link href="/messages" className="hover:underline">{label}</Link> : label}</dt>
              <dd className="mt-1 text-2xl font-extrabold">{n === undefined ? <Skeleton className="h-7 w-10" /> : n}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!stats.data?.topListings.length && (
        <section aria-labelledby="top-h" className="mt-6 rounded-lg border bg-card p-4">
          <h2 id="top-h" className="font-bold">Most viewed in the last 30 days</h2>
          <ol className="mt-2 grid gap-1 text-sm">
            {stats.data.topListings.map((t) => <li key={t.id} className="flex justify-between gap-4"><Link href={`/dashboard/listings/${t.id}/edit`} className="truncate hover:underline">{t.title}</Link><span className="shrink-0 text-muted-foreground">{t.views} {t.views === 1 ? 'view' : 'views'}</span></li>)}
          </ol>
        </section>
      )}

      <section aria-labelledby="listings-h" className="mt-8">
        <h2 id="listings-h" className="text-xl font-bold">Your listings</h2>
        <div role="group" aria-label="Filter listings" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {TABS.map(([v, l]) => <Button key={v} size="sm" className="min-h-10 shrink-0" variant={tab === v ? 'default' : 'outline'} aria-pressed={tab === v} onClick={() => { setTab(v); setPage(1); }}>{l}</Button>)}
        </div>
        <div className="mt-4">
          {list.isLoading ? <div role="status" aria-label="Loading listings" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            : list.isError ? <ErrorState message="We couldn’t load your listings." error={list.error} onRetry={() => { void list.refetch(); }} />
            : !list.data?.data.length ? (
              <EmptyState title={tab === 'all' ? 'You haven’t created a listing yet' : 'Nothing here'} text={tab === 'all' ? 'Create your first listing with details and photos. It goes live as soon as you publish it.' : 'No listings match this filter.'} action={tab === 'all' ? { href: '/dashboard/listings/new', label: 'Create a listing' } : undefined} />
            ) : (
              <>
                <ul className="grid gap-3">
                  {list.data.data.map((row) => (
                    <li key={row.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
                      {row.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={row.imageUrl} alt="" className="size-20 shrink-0 rounded-md bg-muted object-cover" />
                        : <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImageOff className="size-6" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2"><span className="truncate font-bold">{row.title}</span><ListingStatusBadge status={row.status} availability={row.availability} /></p>
                        <p className="text-sm text-muted-foreground">{formatNairaFromKobo(row.priceKobo)} · {row.category} · {row.views30d} {row.views30d === 1 ? 'view' : 'views'} (30 days) · {row.saves} {row.saves === 1 ? 'save' : 'saves'}</p>
                        {row.status === 'rejected' && row.rejectionReason && <p className="mt-1 text-sm font-medium text-destructive">Reason: {row.rejectionReason}</p>}
                        <div className="mt-2"><RowActions row={row} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
                <PageNav meta={list.data.meta} setPage={setPage} />
              </>
            )}
        </div>
      </section>
    </div>
  );
}

function PageNav({ meta, setPage }: { meta: { page: number; totalPages: number }; setPage: (n: number) => void }) {
  if (meta.totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-between">
      <Button variant="outline" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">Page {meta.page} of {meta.totalPages}</span>
      <Button variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)}>Next</Button>
    </div>
  );
}
void Pagination;

export function Dashboard({ published = false, applicationSubmitted = false }: { published?: boolean; applicationSubmitted?: boolean }) {
  return <SellerGate allowPending>{(seller) => <Content shopName={seller.shopName} published={published} applicationSubmitted={applicationSubmitted} />}</SellerGate>;
}
