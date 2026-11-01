'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProductView } from '@/components/marketplace/product-view';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingStatusBadge } from '@/components/seller/status-badge';
import { adminApi } from '@/lib/admin-api';
import { formatNairaFromKobo } from '@/lib/format';
import { AdminShell } from './admin-shell';
import { HistoryList, Pager, ReasonAction, Tabs } from './admin-ui';

const TABS = [['pending_review', 'Awaiting review'], ['published', 'Live'], ['rejected', 'Rejected'], ['removed', 'Removed'], ['all', 'All']] as const;
type Tab = (typeof TABS)[number][0];

function Content() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending_review');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['admin-listings', tab, q, page], queryFn: () => adminApi.listings(tab, q, page) });
  async function approve(id: string) {
    try { await adminApi.reviewListing(id, 'approve'); toast.success('Approved. The seller has been notified.'); await Promise.all([qc.invalidateQueries({ queryKey: ['admin-listings'] }), qc.invalidateQueries({ queryKey: ['admin-overview'] })]); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not approve.'); }
  }
  return (
    <div>
      <h1 className="text-3xl font-bold">Listings</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tabs label="Filter by status" tabs={TABS} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />
        <form role="search" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); setPage(1); }} className="flex gap-2">
          <label htmlFor="al-q" className="sr-only">Search listings or shops</label>
          <Input id="al-q" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} placeholder="Search title or shop" className="w-56" />
          <Button type="submit" size="icon" variant="outline" aria-label="Search"><Search /></Button>
        </form>
      </div>
      <div className="mt-4">
        {list.isLoading ? <div role="status" aria-label="Loading" className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          : list.isError ? <ErrorState message="We couldn’t load listings." />
          : !list.data?.data.length ? <EmptyState title="Nothing here" text={tab === 'pending_review' ? 'No listings are waiting for review.' : 'No listings match.'} />
          : (
            <>
              <ul className="grid gap-3">
                {list.data.data.map((l) => (
                  <li key={l.id} className="flex gap-3 rounded-lg border bg-card p-3">
                    {l.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={l.imageUrl} alt="" className="size-20 shrink-0 rounded-md bg-muted object-cover" />
                      : <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><ImageOff /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2"><Link href={`/admin/listings/${l.id}`} className="truncate font-bold hover:underline">{l.title}</Link><ListingStatusBadge status={l.status} availability={l.availability} />
                        {l.openReports > 0 && <span className="rounded-sm bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{l.openReports} open {l.openReports === 1 ? 'report' : 'reports'}</span>}</p>
                      <p className="text-sm text-muted-foreground">{formatNairaFromKobo(l.priceKobo)} · {l.category} · {l.seller.shopName}</p>
                      <div className="mt-2 flex gap-2"><Button asChild size="sm" variant="outline"><Link href={`/admin/listings/${l.id}`}>Inspect</Link></Button>
                        {l.status === 'pending_review' && <Button size="sm" onClick={() => approve(l.id)}>Approve</Button>}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <Pager meta={list.data.meta} onPage={setPage} />
            </>
          )}
      </div>
    </div>
  );
}
export function ListingsPage() { return <AdminShell><Content /></AdminShell>; }

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-listing', id], queryFn: () => adminApi.listing(id) });
  const decide = (d: string, ok: string) => async (reason?: string) => {
    await adminApi.reviewListing(id, d, reason || undefined); toast.success(ok);
    await Promise.all([qc.invalidateQueries({ queryKey: ['admin-listing', id] }), qc.invalidateQueries({ queryKey: ['admin-listings'] }), qc.invalidateQueries({ queryKey: ['admin-overview'] })]);
  };
  if (q.isLoading) return <div role="status" aria-label="Loading"><Skeleton className="h-96" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t find that listing." />;
  const l = q.data;
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link href="/admin/listings">← All listings</Link></Button>
      <section aria-label="Moderation" className="mb-6 grid gap-3 rounded-lg border-l-4 border-accent bg-card p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">Status: <ListingStatusBadge status={l.status} availability={l.availability} /> · Seller account: <strong>{l.sellerStatus}</strong> · Open reports: <strong>{l.openReports}</strong></p>
        {l.rejectionReason && <p className="text-sm">Reason on file: “{l.rejectionReason}”</p>}
        <div className="flex flex-wrap items-start gap-2">
          {l.status === 'pending_review' && <>
            <ReasonAction label="Approve" variant="default" required={false} confirmLabel="Approve and publish" onSubmit={decide('approve', 'Approved. The seller has been notified.')} />
            <ReasonAction label="Reject" destructive hint="The seller will see this reason and can fix and resubmit." onSubmit={decide('reject', 'Rejected. The seller has been notified.')} />
          </>}
          {l.status !== 'removed' && l.status !== 'archived' && <ReasonAction label="Remove" destructive hint="Hides it immediately. The seller will see this reason and cannot edit it." onSubmit={decide('remove', 'Removed.')} />}
          {l.status === 'removed' && <ReasonAction label="Restore" variant="default" required={false} onSubmit={decide('restore', 'Restored.')} />}
        </div>
        <details><summary className="cursor-pointer text-sm font-semibold">Decision history</summary><div className="mt-2"><HistoryList items={l.history} /></div></details>
      </section>
      <ProductView p={l} preview />
    </div>
  );
}
export function ListingDetail({ id }: { id: string }) { return <AdminShell><Detail id={id} /></AdminShell>; }
