'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { FormError } from '@/components/auth/auth-shell';
import { ApiError, apiFetch } from '@/lib/api';
import { CategoryNode } from '@/lib/marketplace';
import { SellerMe, ShopInput, sellerApi } from '@/lib/seller-api';
import { sellerQueryKey } from './seller-gate';

/** One form for applying and for editing the shop. `seller` present = editing. */
export function ShopForm({ seller }: { seller?: SellerMe }) {
  const router = useRouter();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => apiFetch<CategoryNode[]>('/categories') });
  const [f, setF] = useState({
    shopName: seller?.shopName ?? '', description: seller?.description ?? '', preferredCampusArea: seller?.preferredCampusArea ?? '',
    publicLocation: seller?.publicLocation ?? '', contactPreferences: seller?.contactPreferences ?? '',
  });
  const [selected, setSelected] = useState<string[]>(seller?.categories.map((c) => c.slug) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (slug: string) => setSelected((s) => s.includes(slug) ? s.filter((x) => x !== slug) : s.length < 5 ? [...s, slug] : s);
  const canSubmitLater = !seller || seller.status === 'draft' || seller.status === 'rejected';

  async function run(mode: 'save' | 'draft' | 'submit') {
    setError(null);
    if (f.shopName.trim().length < 2) return setError('Enter a shop name of at least 2 characters.');
    if (mode !== 'draft' && selected.length === 0) return setError('Choose at least one main selling category.');
    setBusy(true);
    try {
      const body: ShopInput = {
        shopName: f.shopName.trim(), description: f.description.trim() || (seller ? null : undefined), categorySlugs: selected.length ? selected : undefined,
        preferredCampusArea: f.preferredCampusArea.trim() || (seller ? null : undefined), contactPreferences: f.contactPreferences.trim() || (seller ? null : undefined),
        ...(seller ? { publicLocation: f.publicLocation.trim() || null } : {}),
      };
      if (!seller) {
        await sellerApi.apply({ ...body, saveAsDraft: mode === 'draft' });
        toast.success(mode === 'draft' ? 'Draft saved.' : 'Application submitted. We’ll review it soon.');
      } else {
        await sellerApi.update(body);
        if (mode === 'submit') { await sellerApi.submitApplication(); toast.success('Application submitted for review.'); } else toast.success('Shop details saved.');
      }
      await qc.invalidateQueries({ queryKey: sellerQueryKey });
      if (mode !== 'save') router.push('/dashboard');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  }

  const options = (cats.data ?? []).flatMap((c) => [c, ...c.children]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(seller && !canSubmitLater ? 'save' : seller ? 'save' : 'submit'); }} noValidate className="grid gap-5">
      <FormError message={error} />
      <TextField label="Shop or display name" value={f.shopName} onChange={set('shopName')} maxLength={60} hint="Shown on your listings and storefront." />
      <TextareaField label="Short shop description" value={f.description} onChange={set('description')} maxLength={500} rows={3} hint="What do you sell? (up to 500 characters)" />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Main selling categories <span className="font-normal text-muted-foreground">(choose up to 5)</span></legend>
        {cats.isLoading && <p className="text-sm text-muted-foreground">Loading categories…</p>}
        {cats.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load categories. Refresh the page.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 rounded-md border bg-card p-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(c.slug)} onChange={() => toggle(c.slug)} disabled={!selected.includes(c.slug) && selected.length >= 5} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Preferred campus area" value={f.preferredCampusArea} onChange={set('preferredCampusArea')} maxLength={80} hint="Private. Helps us understand where you operate." />
      {seller && <TextField label="Public location on your storefront (optional)" value={f.publicLocation} onChange={set('publicLocation')} maxLength={80} hint="Shown to buyers. Leave blank to show none." />}
      <TextField label="Contact preferences (optional)" value={f.contactPreferences} onChange={set('contactPreferences')} maxLength={200} hint="Buyers contact you through in-app messages. Add notes such as the best times to reply." />
      <div className="flex flex-wrap gap-2">
        {!seller && <>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</Button>
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => run('draft')}>Save as draft</Button>
        </>}
        {seller && <Button type="submit" size="lg" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>}
        {seller && canSubmitLater && <Button type="button" size="lg" variant="accent" disabled={busy} onClick={() => run('submit')}>Submit for review</Button>}
      </div>
    </form>
  );
}
