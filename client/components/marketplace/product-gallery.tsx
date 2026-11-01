'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductImage } from './product-image';
import { cn } from '@/lib/utils';

export function ProductGallery({ images }: { images: { url: string; thumbUrl?: string; alt: string }[] }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const show = (next: number) => setIndex((next + images.length) % images.length);
  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;
    const dx = event.changedTouches[0]!.clientX - touchStart.x;
    const dy = event.changedTouches[0]!.clientY - touchStart.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    setTouchStart(null);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
  };
  return (
    <div className="grid gap-3">
      <div
        role="region"
        aria-label="Product photos"
        aria-roledescription="carousel"
        tabIndex={0}
        className="group relative touch-pan-y overflow-hidden rounded-2xl border bg-card p-1.5 shadow-sm"
        onTouchStart={(event) => setTouchStart({ x: event.touches[0]!.clientX, y: event.touches[0]!.clientY })}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => setTouchStart(null)}
        onKeyDown={onKeyDown}
      >
        <div
          className="flex rounded-xl bg-muted transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: `${Math.max(images.length, 1) * 100}%`,
            transform: `translateX(-${index * (100 / Math.max(images.length, 1))}%)`,
          }}
        >
          {images.length > 0
            ? images.map((img, i) => (
              <div
                key={img.url}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${images.length}`}
                aria-hidden={i !== index}
                className="shrink-0"
                style={{ width: `${100 / images.length}%` }}
              >
                <ProductImage image={{ ...img, fallbackUrl: img.thumbUrl }} priority={i === 0} className="aspect-[4/3] w-full" />
              </div>
            ))
            : <ProductImage image={null} className="aspect-[4/3] w-full" />}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => show(index - 1)}
              className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-3">
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button type="button" aria-label="Next photo" onClick={() => show(index + 1)}
              className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-3">
              <ChevronRight aria-hidden className="size-5" />
            </button>
            <span aria-live="polite" aria-atomic="true" className="absolute bottom-4 right-4 rounded-full border border-white/20 bg-foreground/80 px-3 py-1.5 text-xs font-bold text-background shadow">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <ul className="flex items-center justify-center gap-2 overflow-x-auto py-1" aria-label="Choose a product photo">
          {images.map((img, i) => (
            <li key={img.url} className="group shrink-0">
              <button type="button" onClick={() => show(i)} aria-label={`Show photo ${i + 1} of ${images.length}`} aria-current={i === index}
                className="grid size-11 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <span aria-hidden className={cn('size-2.5 rounded-full transition-colors', i === index ? 'bg-primary' : 'bg-muted-foreground/40 group-hover:bg-muted-foreground/70')} />
                <span className="sr-only">{i === index ? 'Current photo' : `Photo ${i + 1}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
