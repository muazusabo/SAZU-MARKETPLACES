'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { FormError } from '@/components/auth/auth-shell';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError, apiFetch } from '@/lib/api';
import { CategoryNode } from '@/lib/marketplace';
import { SellerMe, ShopInput, sellerApi } from '@/lib/seller-api';
import { sellerQueryKey } from './seller-gate';

/** One form for applying and for editing the shop. `seller` present = editing. */
export function ShopForm({ seller }: { seller?: SellerMe }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const draftKey = `sazu:draft:shop:${user?.id ?? 'unknown'}`;
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => apiFetch<CategoryNode[]>('/categories') });
  const [f, setF] = useState({
    shopName: seller?.shopName ?? '', description: seller?.description ?? '', preferredCampusArea: seller?.preferredCampusArea ?? '',
    publicLocation: seller?.publicLocation ?? '', contactPreferences: seller?.contactPreferences ?? '',
  });
  const [selected, setSelected] = useState<string[]>(seller?.categories.map((c) => c.slug) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ shopName?: string; categories?: string }>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'fields' in parsed && 'categories' in parsed) {
          const restored = parsed as { fields: typeof f; categories: string[] };
          if (restored.fields && typeof restored.fields === 'object' && Array.isArray(restored.categories)) {
            setF((current) => ({ ...current, ...restored.fields }));
            setSelected(restored.categories.filter((c) => typeof c === 'string').slice(0, 5));
            setDraftSaved(true);
          }
        }
      }
    } catch {
      setDraftStorageFailed(true);
    } finally {
      setDraftReady(true);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ fields: f, categories: selected }));
      setDraftSaved(true);
      setDraftStorageFailed(false);
    } catch {
      setDraftStorageFailed(true);
    }
  }, [draftKey, draftReady, f, selected]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (slug: string) => {
    setFieldErrors((current) => ({ ...current, categories: undefined }));
    setSelected((s) => s.includes(slug) ? s.filter((x) => x !== slug) : s.length < 5 ? [...s, slug] : s);
  };
  const canSubmitLater = !seller || seller.status === 'draft' || seller.status === 'rejected';

  async function run(mode: 'save' | 'draft' | 'submit') {
    setError(null);
    const nextFieldErrors = {
      shopName: f.shopName.trim().length < 2 ? 'Enter a shop name with at least 2 characters.' : undefined,
      categories: mode !== 'draft' && selected.length === 0 ? 'Choose at least one main selling category.' : undefined,
    };
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.shopName || nextFieldErrors.categories) {
      setError('Fix the highlighted fields to continue.');
      return;
    }
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
      try {
        window.localStorage.removeItem(draftKey);
        setDraftSaved(false);
        setDraftStorageFailed(false);
      } catch {
        setDraftStorageFailed(true);
      }
      await qc.invalidateQueries({ queryKey: sellerQueryKey });
      if (mode !== 'save') router.push(mode === 'submit' ? '/dashboard?application=submitted' : '/dashboard');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  }

  const options = (cats.data ?? []).flatMap((c) => [c, ...c.children]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(seller && !canSubmitLater ? 'save' : seller ? 'save' : 'submit'); }} noValidate className="grid gap-5">
      {draftSaved && <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Your in-progress shop details are saved on this device and will return if your session expires.</p>}
      {draftStorageFailed && <p role="alert" className="rounded-md border border-accent/50 bg-secondary px-3 py-2 text-sm">Your browser couldn’t read or save your shop draft. Submit or save your shop details before leaving this page.</p>}
      <FormError message={error} />
      <TextField label="Shop or display name" value={f.shopName} onChange={(e) => { set('shopName')(e); setFieldErrors((current) => ({ ...current, shopName: undefined })); }} maxLength={60} hint="Shown on your listings and storefront." error={fieldErrors.shopName} />
      <TextareaField label="Short shop description" value={f.description} onChange={set('description')} maxLength={500} rows={3} hint="What do you sell? (up to 500 characters)" />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Main selling categories <span className="font-normal text-muted-foreground">(choose up to 5)</span></legend>
        {cats.isLoading && <p className="text-sm text-muted-foreground">Loading categories…</p>}
        {cats.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><span>Couldn’t load categories.</span><Button type="button" size="sm" variant="outline" onClick={() => void cats.refetch()}>Try again</Button></div>}
        {fieldErrors.categories && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.categories}</p>}
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
