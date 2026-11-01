'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { FormError } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { ApiError, apiFetch } from '@/lib/api';
import { CONDITION_LABELS } from '@/lib/labels';
import { ListingValues, koboToNairaString, listingSchema, listingToPayload } from '@/lib/listing-schema';
import { CategoryNode } from '@/lib/marketplace';
import { OwnListing, sellerApi } from '@/lib/seller-api';
import { ImageManager } from './image-manager';
import { ListingStatusBadge } from './status-badge';

interface CategoryDetail { guidelines: string | null; attributes: { key: string; label: string; inputType: string; options: string[] | null; required: boolean }[] }

function StatusBanner({ l }: { l: OwnListing }) {
  const text: Record<string, string> = {
    draft: 'Draft: only you can see this. Add photos, then publish it.',
    pending_review: 'This listing is awaiting administrator review.',
    rejected: l.rejectionReason ? `Not approved: ${l.rejectionReason}` : 'Not approved. Fix the issues and publish again.',
    archived: 'Archived: restore it from your dashboard to edit or relist.',
    removed: 'This listing was removed by a moderator and can’t be changed.',
    published: l.availability === 'sold' ? 'Marked as sold.' : 'Live: buyers can see this listing. Changes appear immediately.',
  };
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p><ListingStatusBadge status={l.status} availability={l.availability} /> <span className="ml-1">{text[l.status] ?? ''}</span></p>
    </div>
  );
}

export function ListingForm({ listing }: { listing?: OwnListing }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const locked = !!listing && ['archived', 'removed'].includes(listing.status);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => apiFetch<CategoryNode[]>('/categories') });
  const form = useForm<ListingValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: listing?.title ?? '', description: listing?.description ?? '', categorySlug: listing?.category.slug ?? '',
      productType: (listing?.productType as 'product' | 'service') ?? 'product', priceNaira: listing ? koboToNairaString(listing.priceKobo) : '',
      condition: listing?.condition ?? '', campusLocation: listing?.campusLocation ?? '', collectionInfo: listing?.collectionInfo ?? '',
      attributes: listing?.attributeValues ?? {},
    },
  });
  const { register, handleSubmit, watch, reset, formState: { errors, isDirty } } = form;
  const categorySlug = watch('categorySlug');
  const type = watch('productType');
  const detail = useQuery({ queryKey: ['category', categorySlug], queryFn: () => apiFetch<CategoryDetail>(`/categories/${categorySlug}`), enabled: !!categorySlug });
  const defs = detail.data?.attributes ?? [];

  async function save(v: ListingValues): Promise<OwnListing> {
    const payload = listingToPayload(v, defs.map((d) => d.key));
    const saved = listing ? await sellerApi.updateListing(listing.id, payload) : await sellerApi.create(payload);
    await qc.invalidateQueries({ queryKey: ['listing', saved.id] });
    await qc.invalidateQueries({ queryKey: ['seller-listings'] });
    return saved;
  }

  const onSave = handleSubmit(async (v) => {
    setError(null); setBusy('save');
    try {
      const saved = await save(v);
      toast.success(listing ? 'Changes saved.' : 'Draft saved. Now add photos.');
      if (!listing) router.replace(`/dashboard/listings/${saved.id}/edit`); else reset(v);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save. Try again.'); } finally { setBusy(null); }
  });

  const onPublish = handleSubmit(async (v) => {
    if (!listing) return;
    setError(null); setBusy('submit');
    try {
      if (isDirty) await save(v);
      await sellerApi.action(listing.id, 'submit');
      await qc.invalidateQueries({ queryKey: ['seller-listings'] }); await qc.invalidateQueries({ queryKey: ['seller-dashboard'] });
      toast.success('Published. Buyers can see it now.');
      router.push('/dashboard');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not submit. Try again.'); } finally { setBusy(null); }
  });

  const options = (cats.data ?? []);
  return (
    <div className="grid gap-8">
      {listing && <StatusBanner l={listing} />}
      <form onSubmit={onSave} noValidate className="grid gap-5">
        <fieldset disabled={locked || !!busy} className="grid gap-5">
          <FormError message={error} />
          <TextField label="Title" maxLength={120} error={errors.title?.message} {...register('title')} hint="Be specific: brand, model, size." />
          <SelectField label="Category" error={errors.categorySlug?.message} {...register('categorySlug')}>
            <option value="">Choose a category…</option>
            {options.map((c) => c.children.length
              ? <optgroup key={c.slug} label={c.name}><option value={c.slug}>{c.name} (general)</option>{c.children.map((ch) => <option key={ch.slug} value={ch.slug}>{ch.name}</option>)}</optgroup>
              : <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </SelectField>
          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-semibold">This is a</legend>
            <div className="flex gap-4">
              {(['product', 'service'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm"><input type="radio" value={t} className="size-4 accent-primary" {...register('productType')} />{t === 'product' ? 'Product' : 'Service'}</label>
              ))}
            </div>
          </fieldset>
          <TextField label="Price (₦)" inputMode="decimal" error={errors.priceNaira?.message} {...register('priceNaira')} hint="This is the asking price only. Buyers and you agree on payment directly." />
          {type === 'product' && (
            <SelectField label="Condition" error={errors.condition?.message} {...register('condition')}>
              <option value="">Not specified</option>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
          )}
          <TextareaField label="Description" rows={6} maxLength={5000} error={errors.description?.message} {...register('description')} hint="What is it, what state is it in, what’s included? Avoid personal phone numbers; buyers message you in the app." />

          {categorySlug && defs.length > 0 && (
            <fieldset className="grid gap-4 rounded-lg border bg-card p-4">
              <legend className="px-1 text-sm font-semibold">Details for this category</legend>
              {defs.map((d) => {
                const name = `attributes.${d.key}` as const;
                const label = d.required ? `${d.label} (required to submit)` : d.label;
                if (d.inputType === 'select') return (
                  <SelectField key={d.key} label={label} {...register(name)}><option value="">Choose…</option>{(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</SelectField>);
                if (d.inputType === 'boolean') return (
                  <SelectField key={d.key} label={label} {...register(name)}><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></SelectField>);
                return <TextField key={d.key} label={label} maxLength={500} inputMode={d.inputType === 'number' ? 'decimal' : undefined} type={d.inputType === 'url' ? 'url' : 'text'} {...register(name)} />;
              })}
            </fieldset>
          )}
          {detail.data?.guidelines && (
            <p role="note" className="rounded-md border-l-4 border-accent bg-card p-3 text-sm text-muted-foreground"><strong>Guidelines for this category:</strong> {detail.data.guidelines}</p>
          )}

          <TextField label="Campus location (optional)" maxLength={80} error={errors.campusLocation?.message} {...register('campusLocation')} hint="Where buyers can usually find or collect it, e.g. Hostel A, Main Gate." />
          <TextField label="Collection or delivery notes (optional)" maxLength={300} error={errors.collectionInfo?.message} {...register('collectionInfo')} />
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={locked || !!busy || (!!listing && !isDirty)}>{busy === 'save' ? 'Saving…' : listing ? 'Save changes' : 'Save draft'}</Button>
          {listing && ['draft', 'rejected'].includes(listing.status) && (
            <Button type="button" size="lg" variant="accent" className="w-full sm:w-auto" disabled={!!busy} onClick={onPublish}>{busy === 'submit' ? 'Publishing…' : 'Publish listing'}</Button>
          )}
          {listing && <Button asChild size="lg" variant="outline" className="w-full sm:w-auto"><Link href={`/dashboard/listings/${listing.id}/preview`}>Preview</Link></Button>}
          <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto"><Link href="/dashboard">Back to dashboard</Link></Button>
        </div>
      </form>

      {listing ? <ImageManager listingId={listing.id} images={listing.images} disabled={locked} />
        : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Save your draft first, then you can add photos.</p>}
    </div>
  );
}
