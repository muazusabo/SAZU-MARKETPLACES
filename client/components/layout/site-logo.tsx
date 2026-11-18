'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchFreshPublicContent } from '@/lib/content';

export function SiteLogo() {
  const content = useQuery({ queryKey: ['public-site-content'], queryFn: fetchFreshPublicContent });
  const imageUrl = content.data?.site_logo_url || undefined;
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = !!imageUrl && imageUrl !== failedUrl;

  return (
    <Link href="/" aria-label="SAZU Marketplace home" className="group flex h-12 max-w-32 shrink-0 items-center font-display sm:max-w-44">
      {showImage ? (
        <Image src={imageUrl} alt="" width={176} height={48} unoptimized onError={() => setFailedUrl(imageUrl)} className="max-h-12 w-auto max-w-full object-contain transition-opacity group-hover:opacity-80" />
      ) : (
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-accent shadow-sm transition-transform group-hover:-rotate-3 group-hover:scale-105 max-[360px]:size-8">SZ</span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight">SAZU</span>
            <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground max-[360px]:hidden">MARKETPLACE</span>
          </span>
        </span>
      )}
    </Link>
  );
}
