'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Megaphone, Pencil, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from './admin-shell';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/marketplace/states';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminAdvertisement, adminApi } from '@/lib/admin-api';
import { formatMessageTime } from '@/lib/format';
import { errMsg } from '@/components/admin/admin-ui';

type Status = 'draft' | 'published';
type Placement = AdminAdvertisement['placement'];
type Fields = { title: string; advertiserName: string; description: string; destinationUrl: string; placement: Placement; categoryId: string; startAt: string; endAt: string; status: Status };
const placementNames: Record<Placement, string> = {
  home_banner: 'Homepage promotional banner', sponsored_product: 'Sponsored product placement',
  browse_banner: 'Browse-products promotional banner', category_banner: 'Category-specific promotional banner',
};
const statuses = ['active', 'scheduled', 'expired', 'paused', 'draft'] as const;
const emptyFields = (): Fields => ({
  title: '', advertiserName: '', description: '', destinationUrl: '', placement: 'home_banner', categoryId: '',
  startAt: toLocalDateTime(new Date()), endAt: toLocalDateTime(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), status: 'draft',
});
function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function dateValue(value: string) { return new Date(value).toISOString(); }
function currency(value: number) { return new Intl.NumberFormat('en-NG').format(value); }

function AdvertisementForm({ advertisement, onClose }: { advertisement: AdminAdvertisement | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const categoryQuery = useQuery({ queryKey: ['admin-categories'], queryFn: adminApi.categories });
  const [fields, setFields] = useState<Fields>(() => advertisement ? {
    title: advertisement.title, advertiserName: advertisement.advertiserName, description: advertisement.description,
    destinationUrl: advertisement.destinationUrl, placement: advertisement.placement, categoryId: advertisement.categoryId ?? '',
    startAt: toLocalDateTime(new Date(advertisement.startAt)), endAt: toLocalDateTime(new Date(advertisement.endAt)),
    status: advertisement.published ? 'published' : 'draft',
  } : emptyFields());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(advertisement?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  function close(force = false) {
    if ((busy && !force) || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 150);
  }

  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); }, []);
  useEffect(() => {
    if (!file) { setPreview(advertisement?.imageUrl ?? null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, advertisement?.imageUrl]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!advertisement && !file) { toast.error('Choose a banner image to upload.'); return; }
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('Use a JPEG, PNG, or WebP image.'); return; }
      if (file.size > 5 * 1024 * 1024) { toast.error('Banner images can be at most 5 MB.'); return; }
    }
    let destination: URL;
    try { destination = new URL(fields.destinationUrl); } catch { toast.error('Enter a valid destination URL.'); return; }
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) { toast.error('Use an HTTP or HTTPS destination URL.'); return; }
    if (new Date(fields.endAt) <= new Date(fields.startAt)) { toast.error('The end date must be after the start date.'); return; }
    const body = new FormData();
    body.set('title', fields.title); body.set('advertiserName', fields.advertiserName); body.set('description', fields.description);
    body.set('destinationUrl', destination.toString()); body.set('placement', fields.placement);
    body.set('startAt', dateValue(fields.startAt)); body.set('endAt', dateValue(fields.endAt)); body.set('status', fields.status);
    if (fields.placement === 'category_banner' && fields.categoryId) body.set('categoryId', fields.categoryId);
    if (file) body.set('file', file);
    setBusy(true);
    try {
      if (advertisement) await adminApi.updateAdvertisement(advertisement.id, body);
      else await adminApi.createAdvertisement(body);
      await queryClient.invalidateQueries({ queryKey: ['admin-advertisements'] });
      toast.success(advertisement ? 'Advertisement updated.' : fields.status === 'draft' ? 'Draft saved.' : 'Advertisement published.');
      close(true);
    } catch (error) { toast.error(errMsg(error)); }
    finally { setBusy(false); }
  }

  const activeCategories = useMemo(() => (categoryQuery.data ?? []).filter((category) => category.isActive), [categoryQuery.data]);
  return (
    <dialog ref={dialog} aria-labelledby="ad-form-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }} className={`admin-ad-dialog m-auto max-h-[92dvh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-brand-deep/45 ${closing ? 'dialog-closing' : ''}`}>
      <form onSubmit={submit} className="grid gap-5 p-5 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Campaign details</p><h2 id="ad-form-title" className="mt-1 text-2xl font-bold">{advertisement ? 'Edit advertisement' : 'Create advertisement'}</h2><p className="mt-1 text-sm text-muted-foreground">Only administrators can manage campaigns.</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={() => close()} disabled={busy}>Close</Button>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">Advertisement title<input required minLength={3} maxLength={120} value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Advertiser or business name<input required minLength={2} maxLength={120} value={fields.advertiserName} onChange={(e) => setFields({ ...fields, advertiserName: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Short description<textarea required minLength={3} maxLength={500} rows={3} value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} className="rounded-md border bg-card px-3 py-2 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Destination URL<input required type="url" placeholder="https://example.com" value={fields.destinationUrl} onChange={(e) => setFields({ ...fields, destinationUrl: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Placement<select value={fields.placement} onChange={(e) => setFields({ ...fields, placement: e.target.value as Placement, categoryId: '' })} className="h-10 rounded-md border bg-card px-3 font-normal">{Object.entries(placementNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {fields.placement === 'category_banner' && <label className="grid gap-1.5 text-sm font-semibold">Category<select required value={fields.categoryId} onChange={(e) => setFields({ ...fields, categoryId: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal"><option value="">Choose a category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
          <label className="grid gap-1.5 text-sm font-semibold">Campaign starts<input required type="datetime-local" value={fields.startAt} onChange={(e) => setFields({ ...fields, startAt: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Campaign ends<input required type="datetime-local" value={fields.endAt} onChange={(e) => setFields({ ...fields, endAt: e.target.value })} className="h-10 rounded-md border bg-card px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Save as<select value={fields.status} onChange={(e) => setFields({ ...fields, status: e.target.value as Status })} className="h-10 rounded-md border bg-card px-3 font-normal"><option value="draft">Draft</option><option value="published">Publish or schedule</option></select></label>
          <div className="grid gap-1.5 text-sm font-semibold sm:col-span-2"><span>Banner image (JPEG, PNG, or WebP; up to 5 MB)</span><label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-card px-4 py-3 text-sm font-semibold text-primary hover:bg-secondary/50"><ImagePlus aria-hidden className="size-5" />{file?.name ?? (advertisement ? 'Replace banner image (optional)' : 'Choose banner image')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" /></label>{preview && <Image src={preview} alt="Advertisement banner preview" width={960} height={384} unoptimized className="max-h-52 w-full rounded-lg border bg-muted object-contain" />}</div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => close()} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : fields.status === 'draft' ? 'Save draft' : 'Publish advertisement'}</Button></footer>
      </form>
    </dialog>
  );
}

function Content() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-advertisements'], queryFn: adminApi.advertisements });
  const [editing, setEditing] = useState<AdminAdvertisement | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const statusMutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: 'published' | 'paused' }) => adminApi.setAdvertisementStatus(id, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-advertisements'] }), onError: (error) => toast.error(errMsg(error)) });
  const deleteMutation = useMutation({ mutationFn: adminApi.deleteAdvertisement, onSuccess: () => { toast.success('Advertisement deleted.'); void queryClient.invalidateQueries({ queryKey: ['admin-advertisements'] }); }, onError: (error) => toast.error(errMsg(error)) });
  const ads = query.data?.advertisements.filter((ad) => filter === 'all' || ad.status === filter) ?? [];
  const summary = query.data?.totals;
  const metrics = [
    ['Total advertisements', summary?.total], ['Active', summary?.active], ['Scheduled', summary?.scheduled], ['Expired', summary?.expired],
    ['Paused', summary?.paused], ['Total impressions', summary?.impressions], ['Total clicks', summary?.clicks],
  ] as const;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Megaphone aria-hidden className="size-4" />Campaign workspace</p><h1 className="mt-1 text-3xl font-bold">Advertisement management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Create and manage sponsored placements across the marketplace.</p></div><Button onClick={() => setCreating(true)}><Plus aria-hidden className="mr-1 size-4" />Create advertisement</Button></header>
      {query.isError ? <ErrorState message="We couldn’t load advertisements." error={query.error} onRetry={() => { void query.refetch(); }} /> : (
        <>
          <section aria-label="Advertisement overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(([label, value], index) => <article key={label} className="admin-metric-card rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: `${index * 24}ms` }}><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold tabular-nums">{value === undefined ? <Skeleton className="h-8 w-16" /> : currency(value)}</p></article>)}
          </section>
          <section aria-labelledby="campaign-list-heading" className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4 sm:p-5"><div><h2 id="campaign-list-heading" className="text-xl font-bold">Campaigns</h2><p className="mt-1 text-sm text-muted-foreground">Click-through rate: {summary ? `${(summary.clickThroughRate * 100).toFixed(2)}%` : '—'}</p></div><label className="grid gap-1 text-xs font-bold text-muted-foreground">Filter campaigns<select aria-label="Filter campaigns by status" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm font-medium text-foreground"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status[0]!.toUpperCase() + status.slice(1)}</option>)}</select></label></div>
            {!query.data ? <div className="grid gap-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : !ads.length ? <div className="grid min-h-44 place-items-center px-5 text-center"><div><Megaphone aria-hidden className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 font-semibold">{query.data.advertisements.length ? 'No campaigns match this filter' : 'No advertisements yet'}</p><p className="mt-1 text-sm text-muted-foreground">{query.data.advertisements.length ? 'Choose another status to view campaigns.' : 'Create a campaign when you have an approved banner and destination.'}</p></div></div> : (
              <div className="divide-y">
                {ads.map((ad) => <article key={ad.id} className="grid gap-4 p-4 transition-colors hover:bg-secondary/20 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  {ad.imageUrl ? <Image src={ad.imageUrl} alt="" width={560} height={420} unoptimized className="aspect-[2/1] w-full rounded-lg border bg-muted object-cover sm:aspect-[4/3]" /> : <div className="grid aspect-[2/1] place-items-center rounded-lg bg-muted sm:aspect-[4/3]"><ImagePlus aria-hidden className="size-6 text-muted-foreground" /></div>}
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{ad.title}</h3><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold capitalize">{ad.status}</span></div><p className="mt-0.5 text-sm text-muted-foreground">{ad.advertiserName} · {placementNames[ad.placement]}{ad.categorySlug ? ` · ${ad.categorySlug}` : ''}</p><p className="mt-2 line-clamp-2 text-sm">{ad.description}</p><p className="mt-2 text-xs text-muted-foreground">{formatMessageTime(ad.startAt)} – {formatMessageTime(ad.endAt)} · {currency(ad.impressions)} impressions · {currency(ad.clicks)} clicks · {(ad.clickThroughRate * 100).toFixed(2)}% CTR</p></div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">{ad.status === 'draft' ? null : ad.status === 'paused' ? <Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: ad.id, status: 'published' })}><Play aria-hidden className="mr-1 size-3.5" />Reactivate</Button> : <Button size="sm" variant="outline" disabled={statusMutation.isPending || ad.status === 'expired'} onClick={() => statusMutation.mutate({ id: ad.id, status: 'paused' })}><Pause aria-hidden className="mr-1 size-3.5" />Pause</Button>}<Button size="sm" variant="outline" onClick={() => setEditing(ad)}><Pencil aria-hidden className="mr-1 size-3.5" />Edit</Button><Button size="sm" variant="outline" className="text-destructive" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Delete “${ad.title}”? This also deletes its analytics history.`)) deleteMutation.mutate(ad.id); }}><Trash2 aria-hidden className="mr-1 size-3.5" />Delete</Button></div>
                </article>)}
              </div>
            )}
          </section>
        </>
      )}
      {(creating || editing) && <AdvertisementForm key={editing?.id ?? 'new'} advertisement={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </div>
  );
}

export function AdvertisementsPage() { return <AdminShell adminOnly><Content /></AdminShell>; }
