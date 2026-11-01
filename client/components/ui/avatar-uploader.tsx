'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { validateImageFile } from '@/lib/listing-schema';

export function AvatarUploader({ name, imageUrl, upload }: { name: string; imageUrl: string | null; upload: (file: File) => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) return void toast.error(problem);
    setBusy(true);
    try { await upload(file); toast.success('Photo updated.'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not upload the photo.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-4">
      {imageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={imageUrl} alt={`${name} profile`} className="size-20 rounded-full bg-muted object-cover" />
        : <span aria-hidden className="grid size-20 place-items-center rounded-full bg-secondary font-display text-2xl font-bold text-primary">{name.slice(0, 1).toUpperCase()}</span>}
      <div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="avatar-file" aria-label="Choose a profile photo" tabIndex={-1} onChange={onPick} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : imageUrl ? 'Change photo' : 'Add photo'}</Button>
        <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB. It will be cropped square.</p>
      </div>
    </div>
  );
}
