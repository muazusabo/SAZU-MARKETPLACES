'use client';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminSetting, adminApi } from '@/lib/admin-api';
import { AdminShell } from './admin-shell';
import { errMsg } from './admin-ui';

const FORMATS = ['jpeg', 'png', 'webp'];

function SettingRow({ s, onSaved }: { s: AdminSetting; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState<unknown>(s.value);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(s.value);
  const id = `set-${s.key}`;
  async function save() {
    setBusy(true);
    try { await adminApi.updateSetting(s.key, s.type === 'int' ? Number(value) : value); toast.success('Setting saved.'); await onSaved(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await adminApi.uploadSiteLogo(file);
      toast.success('Marketplace logo updated.');
      await onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function removeLogo() {
    setBusy(true);
    try {
      await adminApi.updateSetting(s.key, '');
      toast.success('Marketplace logo removed.');
      await onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label htmlFor={id} className="max-w-xl text-sm font-semibold">{s.label}</label>
        {s.type !== 'image' && <Button size="sm" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>}
      </div>
      {s.type === 'image' && (
        <div className="grid justify-items-start gap-3">
          {typeof s.value === 'string' && s.value ? (
            <div className="grid min-h-20 min-w-40 place-items-center rounded-lg border bg-secondary/50 p-3">
              <Image src={s.value} alt="Current marketplace logo" width={240} height={80} unoptimized className="max-h-20 w-auto max-w-60 object-contain" />
            </div>
          ) : <p className="text-sm text-muted-foreground">No custom logo set. The default SAZU wordmark is displayed.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                void uploadLogo(file);
              }}
              className="block max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:font-semibold file:text-primary-foreground hover:file:opacity-90 disabled:opacity-60"
            />
            {typeof s.value === 'string' && s.value && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void removeLogo()}>Remove logo</Button>}
          </div>
          <p className="text-xs text-muted-foreground">Upload a JPEG, PNG or WebP image. It is resized to fit the site header while preserving its proportions.</p>
        </div>
      )}
      {s.type === 'boolean' && <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" className="size-5 accent-primary" checked={value === true} onChange={(e) => setValue(e.target.checked)} />{value === true ? 'On' : 'Off'}</label>}
      {s.type === 'int' && <><input id={id} inputMode="numeric" value={String(value ?? '')} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} className="h-10 w-40 rounded-md border border-input bg-card px-3 text-sm" /><p className="text-xs text-muted-foreground">Between {s.min?.toLocaleString('en-NG')} and {s.max?.toLocaleString('en-NG')}</p></>}
      {s.type === 'imageTypes' && (
        <div id={id} role="group" aria-label={s.label} className="flex gap-4">{FORMATS.map((f) => {
          const list = (value as string[]) ?? [];
          return <label key={f} className="flex items-center gap-2 text-sm uppercase"><input type="checkbox" className="size-4 accent-primary" checked={list.includes(f)} onChange={(e) => setValue(e.target.checked ? [...list, f] : list.filter((x) => x !== f))} />{f}</label>;
        })}</div>
      )}
      {s.type === 'text' && <textarea id={id} rows={(s.maxLength ?? 0) > 1000 ? 8 : 2} maxLength={s.maxLength} value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />}
    </div>
  );
}

function Content() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: adminApi.settings });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-settings'] }),
      qc.invalidateQueries({ queryKey: ['public-site-content'] }),
    ]);
  };
  const groups = [...new Set((q.data ?? []).map((s) => s.group))];
  return (
    <div>
      <h1 className="text-3xl font-bold">Platform settings</h1>
      <p className="mt-1 text-muted-foreground">Changes apply within seconds and are recorded in the audit log. Empty content pages show “not published yet” to visitors rather than invented text.</p>
      {q.isLoading ? <Skeleton className="mt-6 h-64" /> : q.isError ? <div className="mt-6"><ErrorState message="We couldn’t load settings." /></div> : groups.map((g) => (
        <section key={g} aria-label={g} className="mt-8">
          <h2 className="mb-3 text-xl font-bold">{g}</h2>
          <div className="grid gap-3">{q.data!.filter((s) => s.group === g).map((s) => <SettingRow key={`${s.key}-${JSON.stringify(s.value)}`} s={s} onSaved={refresh} />)}</div>
        </section>
      ))}
    </div>
  );
}
export function SettingsPage() { return <AdminShell adminOnly><Content /></AdminShell>; }
