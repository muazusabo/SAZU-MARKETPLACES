'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { ApiError } from '@/lib/api';
import { validateImageFile } from '@/lib/listing-schema';
import { OwnImage, sellerApi } from '@/lib/seller-api';

export function ImageManager({ listingId, images, disabled }: { listingId: string; images: OwnImage[]; disabled?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['listing', listingId] });
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const [i, file] of files.entries()) {
      const problem = validateImageFile(file);
      if (problem) { toast.error(problem); continue; }
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { await sellerApi.uploadImage(listingId, file); } catch (err) { fail(err); break; }
    }
    setBusy(null);
    await refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = images.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    setBusy('Saving order…');
    try { await sellerApi.reorderImages(listingId, ids); await refresh(); } catch (err) { fail(err); } finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy('Removing…');
    try { await sellerApi.deleteImage(listingId, id); await refresh(); } catch (err) { fail(err); } finally { setBusy(null); }
  }

  async function saveAlt(img: OwnImage, value: string) {
    if (value.trim() === (img.alt ?? '')) return;
    try { await sellerApi.imageAlt(listingId, img.id, value.trim() || null); await refresh(); } catch (err) { fail(err); }
  }

  return (
    <section aria-labelledby="photos-h" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="photos-h" className="text-xl font-bold">Photos</h2>
        <div>
          <input ref={input} id="listing-photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose photos to upload" tabIndex={-1} onChange={onPick} disabled={disabled || !!busy} />
          <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={disabled || !!busy} onClick={() => input.current?.click()}><ImagePlus />Add photos</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">The first photo is the cover. JPEG, PNG or WebP up to 5 MB each. We remove location data from photos automatically.</p>
      {busy && <p role="status" className="text-sm font-medium">{busy}</p>}
      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No photos yet. Listings with clear photos get more attention.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((img, i) => (
            <li key={img.id} className="grid gap-2 rounded-lg border bg-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumbUrl} alt={img.alt || `Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-md bg-muted object-cover" />
              <label className="grid gap-1 text-xs font-semibold">Description for screen readers
                <input defaultValue={img.alt} maxLength={200} disabled={disabled} onBlur={(e) => saveAlt(img, e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm font-normal" />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{i === 0 ? 'Cover photo' : `Photo ${i + 1}`}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Move earlier" disabled={disabled || !!busy || i === 0} onClick={() => move(i, -1)}><ArrowLeft /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Move later" disabled={disabled || !!busy || i === images.length - 1} onClick={() => move(i, 1)}><ArrowRight /></Button>
                  <ConfirmButton variant="ghost" size="icon" className="size-11" aria-label="Remove photo" disabled={disabled || !!busy} confirmLabel="Remove?" onConfirm={() => remove(img.id)}><Trash2 /></ConfirmButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
