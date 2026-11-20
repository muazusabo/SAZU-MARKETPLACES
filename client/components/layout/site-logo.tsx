'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { fetchFreshPublicContent } from '@/lib/content';

export function SiteLogo() {
  const content = useQuery({ queryKey: ['public-site-content'], queryFn: fetchFreshPublicContent });
  const imageUrl = content.data?.site_logo_url || undefined;
  const [failedUrl, setFailedUrl] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const showImage = !!imageUrl && imageUrl !== failedUrl;

  useEffect(() => {
    const image = imageRef.current;
    if (imageUrl && image?.complete && image.naturalWidth === 0) setFailedUrl(imageUrl);
  }, [imageUrl]);

  return (
    <Link href="/" aria-label="SAZU Marketplace home" className="group flex h-14 max-w-48 shrink-0 items-center rounded-xl font-display transition-opacity sm:max-w-60 max-[420px]:max-w-40 max-[380px]:max-w-36">
      {showImage ? (
        <Image
          src={imageUrl}
          alt=""
          width={240}
          height={67}
          priority
          fetchPriority="high"
          unoptimized
          ref={imageRef}
          onError={() => setFailedUrl(imageUrl)}
          className="max-h-14 w-auto max-w-full rounded-xl border border-primary/10 bg-white p-1 object-contain shadow-sm transition-all group-hover:border-primary/20 group-hover:shadow-md"
        />
      ) : (
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-[10px] border border-accent/60 bg-primary text-sm font-bold text-accent shadow-[0_4px_12px_-6px_rgba(6,78,59,0.55)] ring-2 ring-primary/5 transition-all group-hover:-rotate-3 group-hover:scale-105 group-hover:shadow-md max-[360px]:size-8"
          >
            SZ
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-tight">SAZU</span>
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground max-[360px]:hidden">MARKETPLACE</span>
          </span>
        </span>
      )}
    </Link>
  );
}
