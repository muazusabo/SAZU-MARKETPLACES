'use client';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AvatarUploader } from '@/components/ui/avatar-uploader';
import { Button } from '@/components/ui/button';
import { sellerApi } from '@/lib/seller-api';
import { SellerGate, sellerQueryKey } from './seller-gate';
import { ShopForm } from './shop-form';

export function ShopSettings() {
  const qc = useQueryClient();
  return (
    <SellerGate allowUnapproved>{(seller) => (
      <div className="container max-w-2xl py-8">
        <h1 className="text-3xl font-bold">Shop settings</h1>
        <p className="mt-1 text-muted-foreground">Status: <strong>{seller.status}</strong>{seller.reviewNote ? `. ${seller.reviewNote}` : ''}</p>
        <div className="mt-6 grid gap-8">
          <AvatarUploader name={seller.shopName} imageUrl={seller.avatarUrl} upload={async (f) => { await sellerApi.shopAvatar(f); await qc.invalidateQueries({ queryKey: sellerQueryKey }); }} />
          <ShopForm seller={seller} />
          <div className="flex flex-wrap gap-2">
            {seller.status === 'approved' && <Button asChild variant="outline"><Link href={`/seller/${seller.slug}`}>View public storefront</Link></Button>}
            <Button asChild variant="ghost"><Link href="/dashboard">Back to dashboard</Link></Button>
          </div>
        </div>
      </div>
    )}</SellerGate>
  );
}
