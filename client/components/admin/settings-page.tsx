'use client';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminSetting, adminApi } from '@/lib/admin-api';
import { AdminShell } from './admin-shell';
import { errMsg } from './admin-ui';

const FORMATS = ['jpeg', 'png', 'webp'];
const HERO_POSITIONS = [
  { value: 'center', label: 'Center', objectPosition: 'center' },
  { value: 'top', label: 'Center top', objectPosition: 'center top' },
  { value: 'bottom', label: 'Center bottom', objectPosition: 'center bottom' },
  { value: 'left', label: 'Left', objectPosition: 'left center' },
  { value: 'right', label: 'Right', objectPosition: 'right center' },
];

function HomepageHeroSetting({
  imageSetting,
  positionSetting,
  maxBytes,
  onSaved,
}: {
  imageSetting: AdminSetting;
  positionSetting: AdminSetting;
  maxBytes: number;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [position, setPosition] = useState(String(positionSetting.value || 'center'));
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const publishedUrl = typeof imageSetting.value === 'string' ? imageSetting.value : '';
  const publishedPosition = String(positionSetting.value || 'center');
  const previewSrc = imageFailed ? '/campus-scene.svg' : previewUrl || publishedUrl || '/campus-scene.svg';
  const positionDirty = position !== publishedPosition;

  useEffect(() => {
    setPosition(publishedPosition);
  }, [publishedPosition]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function publish() {
    if (!file && !positionDirty) return;
    setBusy(true);
    try {
      if (file) {
        await adminApi.uploadHomepageHero(file, position);
        toast.success('Homepage hero image published.');
        setFile(null);
      } else {
        await adminApi.updateSetting(positionSetting.key, position);
        toast.success('Homepage hero image position saved.');
      }
      setImageFailed(false);
      await onSaved();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  async function restoreDefault() {
    setBusy(true);
    try {
      await adminApi.removeHomepageHero();
      setFile(null);
      setPosition('center');
      setImageFailed(false);
      toast.success('Default homepage illustration restored.');
      await onSaved();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">Hero Background Image</h3>
        <p className="mt-1 text-sm text-muted-foreground">Change the image in the right-hand panel beside the homepage headline.</p>
      </div>
      <div className="relative aspect-[16/7] min-h-40 overflow-hidden rounded-2xl border bg-brand-cream">
        <Image
          src={previewSrc}
          alt={file ? 'Preview of the selected homepage hero image' : 'Currently displayed homepage hero image'}
          fill
          unoptimized
          onError={() => setImageFailed(true)}
          className="object-cover"
          style={{ objectPosition: HERO_POSITIONS.find((item) => item.value === position)?.objectPosition ?? 'center' }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-deep/55 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-brand-deep">
          {file ? 'Preview — not published' : publishedUrl ? 'Currently published' : 'Default illustration'}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
        <div className="grid gap-2">
          <label htmlFor="homepage-hero-file" className="text-sm font-medium">Choose a replacement image</label>
          <input
            id="homepage-hero-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const nextFile = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!nextFile) return;
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
                toast.error('Choose a JPEG, PNG or WebP image.');
                return;
              }
              if (nextFile.size > maxBytes) {
                toast.error(`Image must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`);
                return;
              }
              setImageFailed(false);
              setFile(nextFile);
            }}
            className="block max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:font-semibold file:text-primary-foreground hover:file:opacity-90 disabled:opacity-60"
          />
          <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to {Math.floor(maxBytes / 1024 / 1024)} MB. Images keep their proportions.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="homepage-hero-position" className="text-sm font-medium">Image position</label>
          <select
            id="homepage-hero-position"
            value={position}
            disabled={busy}
            onChange={(event) => setPosition(event.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            {HERO_POSITIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || (!file && !positionDirty)} onClick={() => void publish()}>
          {busy ? 'Publishing…' : file ? 'Publish image' : 'Save position'}
        </Button>
        {(publishedUrl || file) && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void restoreDefault()}>
            Restore default illustration
          </Button>
        )}
        {file && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setImageFailed(false); }}>
            Cancel preview
          </Button>
        )}
      </div>
    </div>
  );
}

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
  const homepageHeroImage = q.data?.find((setting) => setting.key === 'homepage_hero_image_path');
  const homepageHeroPosition = q.data?.find((setting) => setting.key === 'homepage_hero_image_position');
  const maxBytes = Number(q.data?.find((setting) => setting.key === 'max_image_bytes')?.value ?? 5 * 1024 * 1024);
  return (
    <div>
      <h1 className="text-3xl font-bold">Platform settings</h1>
      <p className="mt-1 text-muted-foreground">Changes apply within seconds and are recorded in the audit log. Empty content pages show “not published yet” to visitors rather than invented text.</p>
      {q.isLoading ? <Skeleton className="mt-6 h-64" /> : q.isError ? <div className="mt-6"><ErrorState message="We couldn’t load settings." error={q.error} onRetry={() => { void q.refetch(); }} /></div> : groups.filter((group) => group !== 'Homepage Appearance').map((g) => (
        <section key={g} aria-label={g} className="mt-8">
          <h2 className="mb-3 text-xl font-bold">{g}</h2>
          <div className="grid gap-3">{q.data!.filter((s) => s.group === g).map((s) => <SettingRow key={`${s.key}-${JSON.stringify(s.value)}`} s={s} onSaved={refresh} />)}</div>
        </section>
      ))}
      {!q.isLoading && !q.isError && homepageHeroImage && homepageHeroPosition && (
        <section aria-label="Homepage Appearance" className="mt-8">
          <h2 className="mb-3 text-xl font-bold">Homepage Appearance</h2>
          <HomepageHeroSetting
            imageSetting={homepageHeroImage}
            positionSetting={homepageHeroPosition}
            maxBytes={maxBytes}
            onSaved={refresh}
          />
        </section>
      )}
    </div>
  );
}
export function SettingsPage() { return <AdminShell adminOnly><Content /></AdminShell>; }
