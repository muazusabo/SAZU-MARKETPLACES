'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { adminApi, AdminCategory } from '@/lib/admin-api';
import { AdminShell } from './admin-shell';
import { errMsg } from './admin-ui';

function AttributeEditor({ cat, refresh }: { cat: AdminCategory; refresh: () => Promise<void> }) {
  const [f, setF] = useState({ key: '', label: '', inputType: 'text', options: '', required: false });
  async function run(fn: () => Promise<unknown>, ok: string) { try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(errMsg(e)); } }
  return (
    <div className="grid gap-3">
      <h3 className="font-bold">Fields sellers fill in</h3>
      {!cat.attributes?.length ? <p className="text-sm text-muted-foreground">No category-specific fields yet.</p> : (
        <ul className="grid gap-2">
          {cat.attributes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm">
              <span><strong>{a.label}</strong> <span className="text-muted-foreground">({a.key}, {a.inputType}{a.options ? `: ${a.options.join(', ')}` : ''})</span> {a.required && <Badge variant="warning">required</Badge>} {a.inUse && <Badge>in use</Badge>}</span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => run(() => adminApi.updateAttribute(a.id, { required: !a.required }), 'Field updated.')}>{a.required ? 'Make optional' : 'Make required'}</Button>
                <ConfirmButton size="sm" variant="ghost" confirmLabel="Delete field?" onConfirm={() => run(() => adminApi.deleteAttribute(a.id), 'Field deleted.')}>Delete</ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        await adminApi.addAttribute(cat.id, { key: f.key.trim(), label: f.label.trim(), inputType: f.inputType, required: f.required, options: f.inputType === 'select' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined });
        setF({ key: '', label: '', inputType: 'text', options: '', required: false });
      }, 'Field added.'); }} className="grid gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-2">
        <TextField label="Key" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} hint="lowercase_with_underscores" />
        <TextField label="Label shown to sellers" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <SelectField label="Type" value={f.inputType} onChange={(e) => setF({ ...f, inputType: e.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="select">Choice</option><option value="boolean">Yes / no</option><option value="url">Web link</option></SelectField>
        {f.inputType === 'select' && <TextField label="Options (comma separated)" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />Required before a listing can be submitted</label>
        <div className="sm:col-span-2"><Button type="submit" size="sm">Add field</Button></div>
      </form>
    </div>
  );
}

function Editor({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-category', id], queryFn: () => adminApi.category(id) });
  const [f, setF] = useState<{ name: string; description: string; sortOrder: string; guidelines: string; maxImages: string } | null>(null);
  const cat = q.data;
  if (!cat) return <Skeleton className="h-24" />;
  const form = f ?? { name: cat.name, description: cat.description ?? '', sortOrder: String(cat.sortOrder), guidelines: cat.guidelines ?? '', maxImages: cat.maxImages ? String(cat.maxImages) : '' };
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['admin-category', id] }), onChanged()]); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminApi.updateCategory(id, { name: form.name.trim(), description: form.description.trim() || null, sortOrder: Number(form.sortOrder) || 0, guidelines: form.guidelines.trim() || null, maxImages: form.maxImages ? Number(form.maxImages) : null });
      toast.success('Category saved.'); setF(null); await refresh();
    } catch (err) { toast.error(errMsg(err)); }
  }
  return (
    <div className="grid gap-5 border-t p-4">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={form.name} onChange={(e) => setF({ ...form, name: e.target.value })} />
        <TextField label="Display order" inputMode="numeric" value={form.sortOrder} onChange={(e) => setF({ ...form, sortOrder: e.target.value })} />
        <TextField label="Description" value={form.description} onChange={(e) => setF({ ...form, description: e.target.value })} className="sm:col-span-2" />
        <TextareaField label="Listing guidelines shown to sellers" rows={3} maxLength={1000} value={form.guidelines} onChange={(e) => setF({ ...form, guidelines: e.target.value })} className="sm:col-span-2" hint="For example food-safety rules for this category. Leave blank to show none." />
        <TextField label="Photo limit for this category (1–12, blank = site default)" inputMode="numeric" value={form.maxImages} onChange={(e) => setF({ ...form, maxImages: e.target.value })} />
        <div className="flex items-end gap-2"><Button type="submit">Save</Button></div>
      </form>
      <AttributeEditor cat={cat} refresh={refresh} />
    </div>
  );
}

function Content() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-categories'], queryFn: adminApi.categories });
  const [open, setOpen] = useState<string | null>(null);
  const [nc, setNc] = useState({ name: '', parentSlug: '' });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['admin-categories'] }); };
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { const c = await adminApi.createCategory({ name: nc.name.trim(), parentSlug: nc.parentSlug || undefined }); toast.success('Category created.'); setNc({ name: '', parentSlug: '' }); setOpen(c.id); await refresh(); }
    catch (err) { toast.error(errMsg(err)); }
  }
  async function toggle(c: AdminCategory) {
    try { await adminApi.updateCategory(c.id, { isActive: !c.isActive }); toast.success(c.isActive ? 'Disabled: it and its listings are hidden from buyers.' : 'Enabled.'); await refresh(); }
    catch (err) { toast.error(errMsg(err)); }
  }
  const top = (q.data ?? []).filter((c) => !c.parentSlug);
  return (
    <div>
      <h1 className="text-3xl font-bold">Categories</h1>
      <p className="mt-1 text-muted-foreground">Two levels: categories and subcategories. Disabling hides a category, its subcategories and their listings from buyers.</p>
      <form onSubmit={create} className="mt-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label="New category name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
        <SelectField label="Parent (optional)" value={nc.parentSlug} onChange={(e) => setNc({ ...nc, parentSlug: e.target.value })}><option value="">Top-level category</option>{top.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</SelectField>
        <Button type="submit">Create</Button>
      </form>
      <div className="mt-5">
        {q.isLoading ? <Skeleton className="h-48" /> : q.isError ? <ErrorState message="We couldn’t load categories." error={q.error} onRetry={() => { void q.refetch(); }} /> : !q.data?.length ? <EmptyState title="No categories" text="Create the first one above." /> : (
          <ul className="grid gap-2">
            {q.data.map((c) => (
              <li key={c.id} className={`rounded-lg border bg-card ${c.parentSlug ? 'ml-6' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <button type="button" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)} className="flex items-center gap-2 text-left font-semibold">
                    {open === c.id ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}{c.name}
                    {!c.isActive && <Badge variant="destructive">disabled</Badge>}<span className="text-xs font-normal text-muted-foreground">{c.productCount} listings · {c.attributeCount} fields</span>
                  </button>
                  <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.isActive ? 'Disable' : 'Enable'}</Button>
                </div>
                {open === c.id && <Editor id={c.id} onChanged={refresh} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export function CategoriesPage() { return <AdminShell adminOnly><Content /></AdminShell>; }
