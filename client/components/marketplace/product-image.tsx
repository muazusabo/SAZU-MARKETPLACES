'use client';
import { ImageOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Plain <img> on purpose: uploaded images come from a storage host chosen at deployment time (Phase 4). */
export function ProductImage({ image, className, priority = false }: {
  image: { url: string; alt: string; fallbackUrl?: string | null } | null;
  className?: string;
  priority?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<{ primary: string; usedFallback: boolean; unavailable: boolean } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageUrl = image?.url;
  const imageFallback = image?.fallbackUrl;
  const sourceState = image && failedSource?.primary === image.url ? failedSource : null;
  const src = image ? sourceState?.usedFallback && imageFallback ? imageFallback : image.url : undefined;

  const handleError = useCallback(() => {
    if (!imageUrl) return;
    if (src === imageUrl && imageFallback && imageFallback !== imageUrl) {
      setFailedSource({ primary: imageUrl, usedFallback: true, unavailable: false });
    } else {
      setFailedSource({ primary: imageUrl, usedFallback: sourceState?.usedFallback ?? false, unavailable: true });
    }
  }, [imageFallback, imageUrl, sourceState?.usedFallback, src]);

  useEffect(() => {
    const element = imageRef.current;
    if (element?.complete && element.naturalWidth === 0) handleError();
  }, [handleError, src]);

  if (!image) {
    return (
      <div role="img" aria-label="No photo provided" className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
        <ImageOff aria-hidden className="size-8" />
      </div>
    );
  }
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
      src={src ?? ''}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      ref={imageRef}
      onError={handleError}
      className={cn('bg-muted object-contain', className)}
    />
  );
}
