'use client';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Plain <img> on purpose: uploaded images come from a storage host chosen at deployment time (Phase 4). */
export function ProductImage({ image, className, priority = false }: {
  image: { url: string; alt: string; fallbackUrl?: string | null } | null;
  className?: string;
  priority?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<{ primary: string; usedFallback: boolean; unavailable: boolean } | null>(null);
  if (!image) {
    return (
      <div role="img" aria-label="No photo provided" className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
        <ImageOff aria-hidden className="size-8" />
      </div>
    );
  }
  const sourceState = failedSource?.primary === image.url ? failedSource : null;
  const src = sourceState?.usedFallback && image.fallbackUrl ? image.fallbackUrl : image.url;
  if (sourceState?.unavailable) {
    return (
      <div role="img" aria-label="Product photo unavailable" className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
        <ImageOff aria-hidden className="size-8" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (src === image.url && image.fallbackUrl && image.fallbackUrl !== image.url) {
          setFailedSource({ primary: image.url, usedFallback: true, unavailable: false });
        } else {
          setFailedSource({ primary: image.url, usedFallback: sourceState?.usedFallback ?? false, unavailable: true });
        }
      }}
      className={cn('bg-muted object-cover', className)}
    />
  );
}
